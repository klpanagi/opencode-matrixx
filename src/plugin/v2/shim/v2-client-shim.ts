import { log } from "../../../shared"
import { V2_CAPABILITY_GAPS } from "./capability-gaps"
import { toV1MessageEnvelope } from "./message-envelope"
import { expectCollection, V2ShimProtocolError } from "./protocol"

type V2Client = ReturnType<typeof import("@opencode/client").OpenCode.make>

/**
 * The V1 client surface Matrixx actually calls, backed by probed V2 routes.
 *
 * Every method here corresponds to a route recorded in `docs/v2-smoke.md`. A
 * member with no V2 route is either `throwingUnavailable` (the data does not
 * exist and callers must see that) or an explicit logged no-op for cosmetic
 * features. Nothing returns an empty value to paper over a missing route.
 */
export type V2BackedClient = {
  session: {
    messages: (args: { path: { id: string } }) => Promise<unknown>
    message: (args: { path: { id: string; messageID?: string } }) => Promise<unknown>
    context: (args: { path: { id: string } }) => Promise<unknown>
    list: (args?: unknown) => Promise<unknown>
    create: (args?: unknown) => Promise<unknown>
    get: (args: { path: { id: string } }) => Promise<unknown>
    delete: (args: { path: { id: string } }) => Promise<unknown>
    status: (args?: unknown) => Promise<unknown>
    prompt: (args: unknown) => Promise<unknown>
    promptAsync: (args: unknown) => Promise<unknown>
    abort: (args: { path: { id: string } }) => Promise<unknown>
    summarize: (args: unknown) => Promise<unknown>
    children: (args: { path: { id: string } }) => Promise<unknown>
    revert: (args: { path: { id: string } }) => Promise<never>
    todo: (args: { path: { id: string } }) => Promise<never>
  }
  model: { list: (args?: unknown) => Promise<unknown> }
  provider: { list: (args?: unknown) => Promise<unknown> }
  config: { get: (args?: unknown) => Promise<unknown>; providers: (args?: unknown) => Promise<unknown> }
  command: { list: (args?: unknown) => Promise<unknown> }
  app: { agents: (args?: unknown) => Promise<unknown> }
  tui: { showToast: (args: unknown) => Promise<void> }
}

/** The V1 `{ path: { id } }` argument shape every call site uses. */
function sessionIdOf(args: unknown): string {
  const path = (args as { path?: { id?: unknown } } | undefined)?.path
  const id = path?.id
  if (typeof id !== "string" || id.length === 0) {
    throw new V2ShimProtocolError("session.*", "n/a", "none", "call site passed no session id (expected { path: { id } })")
  }
  return id
}

/** V1 bodies carry `{ parts: [{ type: "text", text }] }`; V2 prompt takes plain text. */
function promptTextOf(args: unknown): string {
  const body = (args as { body?: { parts?: unknown; text?: unknown } } | undefined)?.body
  if (typeof body?.text === "string") return body.text
  const parts = body?.parts
  if (!Array.isArray(parts)) {
    throw new V2ShimProtocolError("session.prompt", "n/a", "none", "call site passed no prompt text")
  }
  return parts
    .map((part) => {
      const record = part as { type?: string; text?: unknown }
      return record?.type === "text" && typeof record.text === "string" ? record.text : ""
    })
    .join("")
}

/**
 * V2 `GET /api/config` returns the config *sources* it loaded
 * (`[{ type, path, info? }]`), not the resolved config V1 callers expect. Later
 * sources win, matching V1's own precedence.
 */
function mergeConfigSources(sources: unknown): Record<string, unknown> {
  expectCollection("config.get", sources, "config sources")
  let merged: Record<string, unknown> = {}
  for (const source of sources as { info?: unknown }[]) {
    if (source?.info !== null && typeof source?.info === "object") {
      merged = { ...merged, ...(source.info as Record<string, unknown>) }
    }
  }
  return merged
}

/**
 * V1 prompt bodies carry `{ parts: [{ type: "text", text }] }`; V2 `session.prompt`
 * takes a flat `{ text }`. The `noReply` flag has no V2 equivalent and is dropped.
 */
function toV2PromptArgs(args: unknown): { sessionID: string; text: string } {
  return { sessionID: sessionIdOf(args), text: promptTextOf(args) }
}

function toV2CompactArgs(args: unknown): { sessionID: string } {
  return { sessionID: sessionIdOf(args) }
}

const unavailable = (member: string) => () => {
  const gap = V2_CAPABILITY_GAPS.find((entry) => entry.member === member)
  return Promise.reject(
    new V2ShimProtocolError(
      member,
      "n/a",
      "none",
      `No V2 route exists for this member. ${gap?.reason ?? "unmapped"}. Probe: ${gap?.probeEvidence ?? "n/a"}. ` +
        `Returning an empty value here would be indistinguishable from a genuine empty result, so this fails loudly.`,
    ),
  )
}

export function createV2BackedClient(client: V2Client, location: { directory: string }): V2BackedClient {
  const loc = { location: { directory: location.directory } }

  return {
    session: {
      messages: async (args) => toV1MessageEnvelope(await client.message.list({ sessionID: sessionIdOf(args) })),
      message: async (args) => toV1MessageEnvelope(await client.message.list({ sessionID: sessionIdOf(args) })),
      context: async (args) => toV1MessageEnvelope(await client.session.context({ sessionID: sessionIdOf(args) })),
      // Every member is `async` so an invalid argument rejects the returned
      // promise instead of throwing synchronously. Call sites guard these calls
      // with `.catch()`, which cannot intercept a synchronous throw.
      list: async () => client.session.list({ directory: location.directory }),
      create: (args) => client.session.create({ ...(args as object) } as never),
      get: async (args) => client.session.get({ sessionID: sessionIdOf(args) }),
      delete: async (args) => client.session.remove({ sessionID: sessionIdOf(args) }),
      // V1 returns a `sessionID -> status` map; V2 `session.active` returns the
      // same shape keyed by session id, with `{ type: "running" }` values.
      status: async () => {
        const active = await client.session.active()
        const map = (active ?? {}) as Record<string, unknown>
        const out: Record<string, string> = {}
        for (const [id, value] of Object.entries(map)) {
          const type = (value as { type?: unknown } | undefined)?.type
          out[id] = type === "running" ? "busy" : "idle"
        }
        return out
      },
      prompt: (args) => client.session.prompt(toV2PromptArgs(args)),
      promptAsync: (args) => client.session.prompt(toV2PromptArgs(args)),
      abort: (args) => client.session.interrupt({ sessionID: sessionIdOf(args) }),
      summarize: (args) => client.session.compact(toV2CompactArgs(args)),
      // Same verified route as `session.list`, filtered to the children of one
      // parent. V2 makes `parentID` a list filter rather than a separate route.
      children: async (args) => client.session.list({ directory: location.directory, parentID: sessionIdOf(args) }),
      revert: unavailable("session.revert"),
      todo: unavailable("session.todo"),
    },
    model: { list: () => client.model.list(loc) },
    provider: { list: () => client.provider.list(loc) },
    config: {
      get: async () => mergeConfigSources(await client.config.get(loc)),
      // V1's `config.providers()` returned provider configuration; V2 serves that
      // from the provider domain. Nothing in src/ calls it, but the V1 client
      // contract exposes it, so it is mapped rather than left undefined.
      providers: () => client.provider.list(loc),
    },
    command: { list: () => client.command.list(loc) },
    app: { agents: () => client.agent.list(loc) },
    tui: {
      // No V2 equivalent. Logged no-op rather than a rejection: a toast is
      // cosmetic, so losing it costs no data, and every call site already
      // `.catch()`es this call. Registered in V2_CAPABILITY_GAPS so it is
      // greppable and reported in the setup summary.
      showToast: async (args) => {
        const body = (args as { body?: { message?: string; variant?: string } } | undefined)?.body
        log("[v2-client-shim] tui.showToast is a no-op on V2 (no tui domain); toast dropped", {
          message: body?.message,
          variant: body?.variant,
        })
      },
    },
  }
}
