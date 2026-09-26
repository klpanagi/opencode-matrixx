import type { CliRuntimeDecision, CliRuntimeEnv } from "./types"

/**
 * Environment variable consulted by the CLI before it touches a daemon.
 *
 * `MATRIXX_CLI_DAEMON=1` permits starting a daemon when none is registered.
 * Any other value (including unset) keeps the CLI fully file-local, which is
 * the pre-V2 behaviour.
 */
export const DAEMON_ENV_VAR = "MATRIXX_CLI_DAEMON"

/** Reads the daemon opt-in from a process-environment-shaped object. */
export function resolveRuntimeEnv(env: Record<string, string | undefined>): { allowDaemonSpawn: boolean; preferInMemory: boolean } {
  const raw = env[DAEMON_ENV_VAR]?.trim()
  return { allowDaemonSpawn: raw === "1", preferInMemory: false }
}

/** True when the caller opted into daemon use for the current process. */
export function isDaemonEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return resolveRuntimeEnv(env).allowDaemonSpawn
}

/**
 * Pure decision: which runtime should the CLI use for this operation?
 *
 * Priority is deliberate:
 * 1. An explicit `preferInMemory` always wins — tests and tooling never spawn.
 * 2. A registered endpoint is used as-is, without starting anything new.
 * 3. Only then may a daemon be spawned, and only when the caller opted in.
 */
export function selectCliRuntime(env: CliRuntimeEnv): CliRuntimeDecision {
  if (env.preferInMemory) {
    return { mode: "in-memory", reason: "prefer-in-memory", spawnDaemon: false }
  }

  if (env.daemonEndpointAvailable) {
    return { mode: "daemon", reason: "daemon-endpoint", spawnDaemon: false }
  }

  if (!env.allowDaemonSpawn) {
    return { mode: "in-memory", reason: "spawn-disabled", spawnDaemon: false }
  }

  return { mode: "daemon", reason: "daemon-spawn", spawnDaemon: true }
}
