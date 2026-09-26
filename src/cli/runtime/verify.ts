import type { DaemonConfigReader, DaemonVerification } from "./types"

/** Shape returned by the V2 `config.get()` call for the fields we compare. */
type DaemonConfigPayload = {
  data?: { plugin?: unknown }
}

function readPluginList(payload: unknown): string[] | undefined {
  const data = (payload as DaemonConfigPayload | undefined)?.data
  const plugin = data?.plugin
  return Array.isArray(plugin) ? plugin.filter((p): p is string => typeof p === "string") : undefined
}

/**
 * Compares the plugin list the CLI just wrote against the daemon's own view.
 *
 * When the runtime is not a daemon, or the daemon cannot answer, the result is
 * `unavailable` — never a silent `ok`. Callers must treat that as "not
 * verified" rather than "verified correct".
 */
export async function verifyPluginsWithDaemon(
  runtime: { mode: "daemon" | "in-memory"; client?: DaemonConfigReader },
  expected: string[],
): Promise<DaemonVerification> {
  if (runtime.mode !== "daemon" || !runtime.client) {
    return { status: "unavailable", detail: `runtime is in-memory; daemon config not consulted` }
  }

  try {
    const reported = readPluginList(await runtime.client.config.get())
    if (!reported) {
      return { status: "unavailable", detail: "daemon returned no plugin list" }
    }
    const missing = expected.filter((p) => !reported.includes(p))
    if (missing.length > 0) {
      return { status: "mismatch", reported, detail: `daemon is missing: ${missing.join(", ")}` }
    }
    return { status: "match", reported }
  } catch (err) {
    return { status: "unavailable", detail: err instanceof Error ? err.message : String(err) }
  }
}
