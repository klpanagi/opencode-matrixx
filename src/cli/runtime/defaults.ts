import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import type { CliRuntimeClient, CliRuntimeClientFactory, CliRuntimeService } from "./types"

/**
 * Real collaborators for the CLI runtime seam.
 *
 * - `defaultCliService` is the V2 daemon lifecycle from `@opencode/client`.
 * - `defaultDaemonClientFactory` is `OpenCode.make()` from `@opencode/client`.
 *
 * The in-memory V1 runtime lives in `./in-memory` instead: `build:cli` bundles
 * without externals, and inlining the V1 SDK breaks the CLI under plain `node`.
 * Callers that need an in-process server inject a factory explicitly.
 */
export const defaultCliService: CliRuntimeService = {
  discover: (options) => Service.discover(options),
  ensure: (options) => Service.ensure(options),
  headers: (endpoint) => Service.headers(endpoint),
}

export const defaultDaemonClientFactory: CliRuntimeClientFactory = (options) =>
  OpenCode.make({
    baseUrl: options.baseUrl,
    headers: options.headers,
  }) as unknown as CliRuntimeClient
