import type { Project } from "@opencode-ai/sdk"
import { $ } from "bun"

import { log } from "../../shared"
import type { PluginContext } from "../types"
import {
  type ResolvedServerEndpoint,
  resolveServerEndpoint,
  type ServerEndpointSource,
} from "./server-endpoint"
import { createV2ClientShim } from "./shim"

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
 * `client` is a V1-named shim whose every member routes to a real V2 endpoint
 * through `@opencode/client`. It replaces a V1 SDK client that was pointed at the
 * V2 server, which was refuted by the Docker smoke test: V2 serves its SPA at
 * HTTP 200 for unknown paths, so every V1 route answered 200 with HTML and the
 * SDK reported plausible empty data — Matrixx logged `providerCount: 0` as a
 * success. The shim cannot reproduce that, because the V2 client refuses any
 * non-JSON body, and because a member with no V2 route throws or is an explicit
 * logged no-op rather than returning an empty value.
 *
 * The route each member uses was probed against a live V2 server; see
 * `docs/v2-smoke.md` and `V2_MAPPED_MEMBERS` / `V2_CAPABILITY_GAPS`.
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

  const { client } = createV2ClientShim({
    baseUrl: url,
    directory: source.location.directory,
    // Only a discovered or env-configured endpoint is trustworthy. The probe
    // established that a V2 host publishes no OPENCODE_* variable, so the port
    // fallback is an assumption and is labelled as one to the shim.
    endpointConfirmed: serverUrlSource !== "port-fallback",
  })

  const ctx: PluginContext = {
    client: client as unknown as PluginContext["client"],
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
