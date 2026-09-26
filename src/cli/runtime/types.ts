/**
 * Types for the CLI runtime seam.
 *
 * The Matrixx CLI talks to OpenCode over one of two runtimes:
 *
 * 1. `daemon` — a V2 daemon connection built with `OpenCode.make()` from
 *    `@opencode/client`, against an endpoint obtained from `Service.ensure()`.
 * 2. `in-memory` — the V1 `@opencode-ai/sdk` in-process server, kept for test
 *    and tooling paths where no daemon is registered.
 *
 * Every collaborator is expressed as a structural type here so the decision
 * logic can be driven by fakes in tests without spawning a real daemon.
 */

/** Endpoint advertised by a local OpenCode service. */
export type CliRuntimeEndpoint = {
  readonly url: string
  readonly auth?: {
    readonly type: "basic"
    readonly username: string
    readonly password: string
  }
}

/** Daemon lifecycle operations the CLI depends on. */
export type CliRuntimeService = {
  discover: (options?: { readonly file?: string; readonly version?: string }) => Promise<CliRuntimeEndpoint | undefined>
  ensure: (options?: {
    readonly file?: string
    readonly version?: string
    readonly command?: ReadonlyArray<string>
    readonly env?: Readonly<Record<string, string>>
  }) => Promise<CliRuntimeEndpoint>
  headers: (endpoint: CliRuntimeEndpoint) => { authorization: string } | undefined
}

/** Inputs accepted by the V2 client factory. */
export type CliRuntimeClientOptions = {
  readonly baseUrl: string
  readonly headers?: Record<string, string>
}

/**
 * Structural view of the V2 client surface the CLI uses. Typed structurally so
 * the in-memory V1 client (which has a different shape) is never forced into it.
 */
export type CliRuntimeClient = {
  readonly session: {
    create: (input?: unknown) => Promise<unknown>
    prompt: (input: unknown) => Promise<unknown>
  }
  readonly server: {
    info: () => Promise<unknown>
  }
  readonly config: {
    get: (input?: unknown) => Promise<unknown>
  }
}

export type CliRuntimeClientFactory = (options: CliRuntimeClientOptions) => CliRuntimeClient

/** Inputs to the pure runtime decision function. */
export type CliRuntimeEnv = {
  /** A daemon registration file was found for this machine. */
  daemonEndpointAvailable: boolean
  /** The caller permits starting a daemon when none is registered. */
  allowDaemonSpawn: boolean
  /** The caller forces the in-memory runtime regardless of daemon state. */
  preferInMemory?: boolean
}

export type CliRuntimeMode = "daemon" | "in-memory"

export type CliRuntimeReason = "daemon-endpoint" | "daemon-spawn" | "no-endpoint" | "spawn-disabled" | "prefer-in-memory"

export type CliRuntimeDecision = {
  mode: CliRuntimeMode
  reason: CliRuntimeReason
  spawnDaemon: boolean
}

/** The in-memory V1 runtime handle. */
export type InMemoryRuntime = {
  mode: "in-memory"
  client: unknown
  server: { url: string; close: () => void }
}

/** The result of resolving a runtime for a CLI operation. */
export type CliRuntime = {
  mode: CliRuntimeMode
  decision: CliRuntimeDecision
  client?: CliRuntimeClient
  endpoint?: CliRuntimeEndpoint
  inMemory?: InMemoryRuntime
  /** Why the daemon path was abandoned, when it was. */
  fallbackReason?: string
}

/** Outcome of comparing the written plugin list against the daemon's own view. */
export type DaemonVerification = {
  status: "match" | "mismatch" | "unavailable"
  reported?: string[]
  detail?: string
}

/**
 * Narrow structural view used by verification: only `config.get` is required,
 * so fakes need not implement the full client surface.
 */
export type DaemonConfigReader = {
  config: {
    get: (input?: unknown) => Promise<unknown>
  }
}
