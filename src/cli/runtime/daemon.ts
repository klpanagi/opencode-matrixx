import { selectCliRuntime } from "./select"
import type { CliRuntime, CliRuntimeClientFactory, CliRuntimeEndpoint, CliRuntimeEnv, CliRuntimeService } from "./types"

/** Collaborators required to resolve a runtime. All injectable for tests. */
export type ConnectDeps = {
  env: CliRuntimeEnv
  service: Pick<CliRuntimeService, "discover" | "headers">
  makeClient: CliRuntimeClientFactory
  ensure: (options?: { readonly version?: string }) => Promise<CliRuntimeEndpoint>
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Resolves the daemon runtime described by `deps.env`, or reports that the
 * caller should fall back to the in-memory runtime.
 *
 * No daemon is ever started unless the decision says so, so a CLI invocation
 * with `MATRIXX_CLI_DAEMON` unset performs zero process spawning here.
 */
export async function connectCliRuntime(deps: ConnectDeps): Promise<CliRuntime> {
  const decision = selectCliRuntime(deps.env)

  if (decision.mode === "in-memory") {
    return { mode: "in-memory", decision }
  }

  try {
    const endpoint = decision.spawnDaemon ? await deps.ensure() : await deps.service.discover()

    if (!endpoint) {
      return {
        mode: "in-memory",
        decision: { mode: "in-memory", reason: "no-endpoint", spawnDaemon: false },
        fallbackReason: "no daemon endpoint registered",
      }
    }

    const client = deps.makeClient({
      baseUrl: endpoint.url,
      headers: deps.service.headers(endpoint),
    })

    return { mode: "daemon", decision, client, endpoint }
  } catch (err) {
    return {
      mode: "in-memory",
      decision: { mode: "in-memory", reason: "no-endpoint", spawnDaemon: false },
      fallbackReason: errorMessage(err),
    }
  }
}
