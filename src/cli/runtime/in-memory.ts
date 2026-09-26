import type { InMemoryRuntime } from "./types"

/**
 * In-memory V1 runtime for tests and tooling.
 *
 * Kept out of the CLI entry's import graph on purpose: `build:cli` bundles with
 * no externals, so inlining the CJS V1 SDK makes `node dist/cli.js` fail with
 * `__require is not a function`. The pinned SDK has no `OpenCode.create`; its
 * in-process factory is the top-level `createOpencode()`.
 */
export const createInMemoryRuntime = async (): Promise<InMemoryRuntime> => {
  const { createOpencode } = await import("@opencode-ai/sdk")
  const { client, server } = await createOpencode()
  return {
    mode: "in-memory",
    client,
    server: { url: server.url, close: () => server.close() },
  }
}
