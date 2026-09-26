import { OpenCode } from "@opencode/client"

import { log } from "../../../shared"
import { getServerBasicAuthHeader } from "../../../shared/opencode-server-auth"
import { logV2CapabilitySummary } from "./capability-gaps"
import { createV2BackedClient, type V2BackedClient } from "./v2-client-shim"

export type V2ClientShim = {
  client: V2BackedClient
  /** True when the endpoint was a confirmed source rather than the port guess. */
  endpointConfirmed: boolean
}

export type CreateV2ClientShimOptions = {
  baseUrl: URL
  directory: string
  /**
   * Whether `baseUrl` came from a trustworthy source. `false` for the port
   * fallback: the probe established that a V2 host sets no `OPENCODE_*` variable,
   * so the conventional port is an assumption, not a fact.
   */
  endpointConfirmed: boolean
  /** Overridden in tests. */
  authHeader?: () => string | undefined
}

/**
 * Builds the V1-named client surface the ~80 Matrixx hook factories call, backed
 * by the real V2 server through `@opencode/client`.
 *
 * Auth is taken from `OPENCODE_SERVER_PASSWORD` via the existing shared helper.
 * On a V2 host that variable is not set — the smoke test observed the password
 * being printed to the server's stdout and no env var at all — so this is
 * typically an unauthenticated client against a local server. That is not
 * papered over: the shim logs whether it is authenticated, and callers that need
 * an authenticated server must export the variable themselves.
 */
export function createV2ClientShim(options: CreateV2ClientShimOptions): V2ClientShim {
  const authHeader = (options.authHeader ?? getServerBasicAuthHeader)()

  const client = OpenCode.make({
    baseUrl: options.baseUrl.toString(),
    headers: authHeader ? { Authorization: authHeader } : {},
  })

  const shim = createV2BackedClient(client, { directory: options.directory })

  if (!options.endpointConfirmed) {
    log("[v2-client-shim] WARNING: server endpoint was assumed, not discovered", {
      baseUrl: options.baseUrl.toString(),
      detail:
        "No OPENCODE_* variable was published by the V2 host, so the endpoint came from the conventional port. " +
        "If this is wrong, every call below will fail loudly rather than return empty data.",
    })
  }

  if (!authHeader) {
    log("[v2-client-shim] No server auth header available (OPENCODE_SERVER_PASSWORD unset)", {
      detail: "This is the normal case on V2; requests are sent unauthenticated to the resolved endpoint.",
    })
  }

  logV2CapabilitySummary(options.baseUrl.toString())

  return { client: shim, endpointConfirmed: options.endpointConfirmed }
}
