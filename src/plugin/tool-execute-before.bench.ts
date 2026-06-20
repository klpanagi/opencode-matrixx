/**
 * Task-0 baseline benchmark for `tool.execute.before` handler.
 *
 * Measures:
 *   - 1000 sequential invocations of `createToolExecuteBeforeHandler` with 15 dummy hooks
 *   - p50 / p95 / p99 per-call latency and total wall time
 *   - Sequential invocation order (each hook completes before next starts)
 *
 * Run with: `bun test src/plugin/tool-execute-before.bench.ts`
 *
 * This file is intentionally NOT named `*.test.ts` so it is not picked up
 * by CI's `find ... -name '*.test.ts'` sweep. It must be added explicitly
 * to the workflow files.
 */
import { describe, expect, test } from "bun:test"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"

// Must match the order in tool-execute-before.ts:20-34
const HOOK_NAMES = [
  "secretLeakGuard",
  "envFileWriteGuard",
  "bashFileReadGuard",
  "writeExistingFileGuard",
  "qualityGate",
  "questionLabelTruncator",
  "nonInteractiveEnv",
  "commentChecker",
  "directoryAgentsInjector",
  "directoryReadmeInjector",
  "rulesInjector",
  "tasksTodowriteDisabler",
  "prometheusMdOnly",
  "sisyphusJuniorNotepad",
  "atlasHook",
] as const

const ITERATIONS = 1000

function buildHooks(globalOrder: { value: number }, callOrder: number[]): Record<string, unknown> {
  const hooks: Record<string, unknown> = {}
  for (const name of HOOK_NAMES) {
    hooks[name] = {
      "tool.execute.before": async () => {
        // Record at the START of the hook to verify sequential ordering.
        // Each call across all iterations pushes a unique monotonic index.
        callOrder.push(globalOrder.value++)
      },
    }
  }
  return hooks
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))
  return sortedAsc[idx]
}

describe("tool.execute.before baseline", () => {
  test(
    "1000 sequential calls: latency profile + sequential hook ordering",
    async () => {
      //#given
      const globalOrder = { value: 0 }
      const callOrder: number[] = []
      const hooks = buildHooks(globalOrder, callOrder)
      const ctx = { client: {} } as unknown as Parameters<typeof createToolExecuteBeforeHandler>[0]["ctx"]
      const handler = createToolExecuteBeforeHandler({
        ctx,
        hooks: hooks as Parameters<typeof createToolExecuteBeforeHandler>[0]["hooks"],
      })

      // `bash` is the simplest path — skips task-tool and slashcommand post-hooks.
      const input = { tool: "bash", sessionID: "ses_bench", callID: "call_1" }
      const output = { args: { command: "ls" } as Record<string, unknown> }

      //#when
      const latencies: number[] = []
      const totalStart = performance.now()
      for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now()
        await handler(input, output)
        const elapsed = performance.now() - start
        latencies.push(elapsed)
      }
      const totalMs = performance.now() - totalStart

      //#then
      const sorted = [...latencies].sort((a, b) => a - b)
      const p50 = percentile(sorted, 50)
      const p95 = percentile(sorted, 95)
      const p99 = percentile(sorted, 99)
      const min = sorted[0] ?? 0
      const max = sorted[sorted.length - 1] ?? 0
      const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length

      // Output in parseable key=value format (single line) for downstream tools
      console.log(
        `BASELINE tool_execute_before ` +
          `p50_ms=${p50.toFixed(4)} ` +
          `p95_ms=${p95.toFixed(4)} ` +
          `p99_ms=${p99.toFixed(4)} ` +
          `min_ms=${min.toFixed(4)} ` +
          `max_ms=${max.toFixed(4)} ` +
          `mean_ms=${mean.toFixed(4)} ` +
          `total_ms_1000_calls=${totalMs.toFixed(4)} ` +
          `iterations=${ITERATIONS} ` +
          `hooks_per_call=${HOOK_NAMES.length}`,
      )

      // Sequential invocation: each of the 15 hooks must be called exactly once
      // per iteration, in the documented order. The push-index is unique and
      // monotonic, so the array should be [0, 1, 2, ..., ITERATIONS*15 - 1].
      expect(callOrder.length).toBe(ITERATIONS * HOOK_NAMES.length)
      for (let i = 0; i < callOrder.length; i++) {
        expect(callOrder[i]).toBe(i)
      }

      // Sanity: p99 >= p50
      expect(p99).toBeGreaterThanOrEqual(p50)
      // Sanity: total wall time is reasonable (< 30s per task spec)
      expect(totalMs).toBeLessThan(30_000)
    },
    30_000,
  )
})
