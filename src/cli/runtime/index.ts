import { connectCliRuntime } from "./daemon"
import { defaultCliService, defaultDaemonClientFactory } from "./defaults"
import { isDaemonEnabled } from "./select"
import type { CliRuntime, CliRuntimeClientFactory, CliRuntimeEnv, CliRuntimeService, InMemoryRuntime } from "./types"

export { connectCliRuntime } from "./daemon"
export { defaultCliService, defaultDaemonClientFactory } from "./defaults"
export { DAEMON_ENV_VAR, isDaemonEnabled, resolveRuntimeEnv, selectCliRuntime } from "./select"
export type {
  CliRuntime,
  CliRuntimeClient,
  CliRuntimeClientFactory,
  CliRuntimeClientOptions,
  CliRuntimeDecision,
  CliRuntimeEndpoint,
  CliRuntimeEnv,
  CliRuntimeMode,
  CliRuntimeReason,
  CliRuntimeService,
  DaemonVerification,
  InMemoryRuntime,
} from "./types"
export { verifyPluginsWithDaemon } from "./verify"

export type CreateCliRuntimeDeps = {
  service?: CliRuntimeService
  makeClient?: CliRuntimeClientFactory
  createInMemory?: () => Promise<InMemoryRuntime>
  env?: CliRuntimeEnv
  allowDaemonSpawn?: boolean
  probe?: () => Promise<boolean>
}

/**
 * Resolves the runtime the CLI should use.
 *
 * Order of preference:
 * 1. daemon (only when an endpoint exists, or when daemon use was opted into)
 * 2. in-memory, when a daemon cannot be reached
 *
 * The in-memory branch only materialises a server when `deps.createInMemory` is
 * supplied; file-based CLI commands need no in-process server at all.
 *
 * `deps.probe` lets a caller short-circuit daemon selection by reporting that no
 * registration file exists, without the seam touching the filesystem itself.
 */
export async function createCliRuntime(deps: CreateCliRuntimeDeps = {}): Promise<CliRuntime> {
  const service = deps.service ?? defaultCliService
  const makeClient = deps.makeClient ?? defaultDaemonClientFactory
  const allowDaemonSpawn = deps.allowDaemonSpawn ?? isDaemonEnabled()

  const endpointAvailable = deps.probe ? await deps.probe() : true
  const env: CliRuntimeEnv = { daemonEndpointAvailable: endpointAvailable, allowDaemonSpawn }

  const daemon = await connectCliRuntime({
    env,
    service,
    makeClient,
    ensure: (options) => service.ensure(options),
  })

  if (daemon.mode === "daemon") return daemon

  if (!deps.createInMemory) return daemon

  const inMemory = await deps.createInMemory()
  return { ...daemon, inMemory }
}
