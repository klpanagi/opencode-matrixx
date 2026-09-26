import { createOpencodeClient, type Project } from "@opencode-ai/sdk"
import { $ } from "bun"

import { log } from "../../shared"
import { injectServerAuthIntoClient } from "../../shared/opencode-server-auth"
import type { PluginContext } from "../types"
import {
  type ResolvedServerEndpoint,
  resolveServerEndpoint,
  type ServerEndpointSource,
} from "./server-endpoint"

/**
 * The slice of the V2 plugin context the adapter reads. A real V2 `Context`
 * satisfies it structurally, and so does a test fake.
 */
export type V2ContextSource = {
  location: {
    directory: string
    project: { id: string; directory: string; canonical: string }
  }
}

export type V1ContextAdapterOptions = {
  /** Overrides endpoint resolution. Overridden in tests. */
  resolveEndpoint?: () => Promise<ResolvedServerEndpoint>
  /** V1 `Project.time` is epoch seconds; injected so the mapping is assertable. */
  now?: () => number
}

export type AdaptedV1Context = {
  ctx: PluginContext
  serverUrl: URL
  /** Provenance of `serverUrl`, so setup can log a guessed endpoint as a guess. */
  serverUrlSource: ServerEndpointSource
}

/**
 * V1 `Project` carries git worktree metadata V2 does not expose on the location
 * (`ProjectUpdated` exists as an event but has no read API here). Only the three
 * required fields are reconstructed; the absent ones stay undefined rather than
 * being invented.
 */
function toProject(source: V2ContextSource, now: () => number): Project {
  return {
    id: source.location.project.id,
    worktree: source.location.directory,
    time: { created: Math.floor(now() / 1000) },
  }
}

/**
 * Builds the V1 plugin context the ~80 Matrixx hook factories are written
 * against, from a V2 plugin context.
 *
 * `client` is a genuine V1 SDK client bound to the same OpenCode server the V2
 * host is running, not a hand-written stand-in. That is deliberate: V2's
 * `Context` exposes no `client` domain, and its `SessionDomain` is a `Pick` that
 * omits `messages`, `todo`, `status`, `summarize` and the rest — roughly 30 of
 * the client methods Matrixx calls have no V2 counterpart to map onto.
 * Re-deriving them by hand would be a silent reimplementation with no test
 * oracle; pointing the real SDK client at the real server is faithful by
 * construction, and it is what V1 itself hands the plugin.
 *
 * Every other member is derived from `ctx.location`, and the endpoint's
 * provenance is returned so the caller can log a best-effort guess as one.
 */
export async function createV1ContextFromV2(
  source: V2ContextSource,
  options: V1ContextAdapterOptions = {}
): Promise<AdaptedV1Context> {
  const resolveEndpoint = options.resolveEndpoint ?? (() => resolveServerEndpoint())
  const now = options.now ?? Date.now
  const { url, source: serverUrlSource } = await resolveEndpoint()

  const client = createOpencodeClient({ baseUrl: url.toString(), directory: source.location.directory })
  injectServerAuthIntoClient(client)

  const ctx: PluginContext = {
    client,
    project: toProject(source, now),
    directory: source.location.directory,
    worktree: source.location.directory,
    serverUrl: url,
    $,
  }

  log("[context-adapter] V1 context derived from V2 context", {
    directory: ctx.directory,
    serverUrl: ctx.serverUrl.toString(),
    serverUrlSource,
  })

  return { ctx, serverUrl: url, serverUrlSource }
}
