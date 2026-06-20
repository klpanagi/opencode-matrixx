/**
 * Task T1.1 benchmark for `tool.execute.before` handler.
 *
 * After the 3-wave parallelization refactor:
 *   Wave 1 (5 hooks, parallel via Promise.all):         qualityGate,
 *                                                     commentChecker,
 *                                                     directoryAgentsInjector,
 *                                                     directoryReadmeInjector,
 *                                                     rulesInjector
 *   Wave 2 (5 hooks, parallel via Promise.allSettled): secretLeakGuard,
 *                                                     envFileWriteGuard,
 *                                                     writeExistingFileGuard,
 *                                                     tasksTodowriteDisabler,
 *                                                     prometheusMdOnly (BLOCKING)
 *   Wave 3 (6 calls, sequential):                     nonInteractiveEnv,
 *                                                     bashFileReadGuard,
 *                                                     questionLabelTruncator,
 *                                                     prometheusMdOnly (MUTATOR),
 *                                                     sisyphusJuniorNotepad,
 *                                                     atlasHook
 *
 * Total: 16 calls per iteration (prometheusMdOnly appears in both Wave 2 and
 * Wave 3; the handler calls `hooks.prometheusMdOnly?.["tool.execute.before"]`
 * twice — once in Wave 2 and once in Wave 3 — so the bench must build a
 * SINGLE prometheusMdOnly hook that records both invocations).
 *
 * Assertions:
 *   - All 16 hook invocations per iteration.
 *   - Wave ordering invariant: every Wave 2 call strictly after every Wave 1
 *     call; every Wave 3 call strictly after every Wave 2 call (because
 *     `await Promise.all`/`Promise.allSettled` does not return until the
 *     entire wave resolves).
 *   - Within Wave 3, the 6 calls occur in documented order (mutator order
 *     matters: nonInteractiveEnv rewrites output.args.command and must
 *     precede other mutators; atlasHook prepends outermost so must run last).
 *   - Waves 1 and 2 admit any internal order (parallel execution); we do
 *     not assert that.
 *   - Per-iteration global counter increments by exactly 16 with no gaps
 *     or duplicates, across all ITERATIONS.
 *   - prometheusMdOnly is called exactly twice per iteration (one in Wave 2,
 *     one in Wave 3).
 *
 * Target: p99 < 0.0158ms (baseline 0.0226ms × 0.7, Task T1.1 spec).
 *
 * Run with: `bun test src/plugin/tool-execute-before.bench.ts`
 *
 * This file is intentionally NOT named `*.test.ts` so it is not picked up
 * by CI's `find ... -name '*.test.ts'` sweep. It must be added explicitly
 * to the workflow files.
 */
import { describe, expect, test } from "bun:test"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"

type HookName = string

interface RecordedCall {
  name: HookName
  // Global monotonic counter shared across all hooks in all iterations.
  globalOrder: number
  // Iteration this call belongs to.
  iteration: number
}

const WAVE_1: HookName[] = [
  "qualityGate",
  "commentChecker",
  "directoryAgentsInjector",
  "directoryReadmeInjector",
  "rulesInjector",
]

const WAVE_2: HookName[] = [
  "secretLeakGuard",
  "envFileWriteGuard",
  "writeExistingFileGuard",
  "tasksTodowriteDisabler",
  "prometheusMdOnly",
]

const WAVE_3: HookName[] = [
  "nonInteractiveEnv",
  "bashFileReadGuard",
  "questionLabelTruncator",
  "prometheusMdOnly",
  "sisyphusJuniorNotepad",
  "atlasHook",
]

const HOOKS_PER_CALL = WAVE_1.length + WAVE_2.length + WAVE_3.length

const ITERATIONS = 1000

function buildHooks(globalOrder: { value: number }): {
  hooks: Record<string, unknown>
  calls: RecordedCall[]
  recordIteration: (iter: number) => void
} {
  const calls: RecordedCall[] = []
  const hooks: Record<string, unknown> = {}
  let currentIteration = 0

  // Single hook factory — we don't tag wave here because the wave is
  // implicit in the call's position in the iteration's call sequence
  // (see assertions below). All 15 unique hook names get exactly one hook
  // each, even though prometheusMdOnly is invoked twice by the handler.
  function makeHook(name: HookName) {
    return {
      "tool.execute.before": async () => {
        calls.push({
          name,
          globalOrder: globalOrder.value++,
          iteration: currentIteration,
        })
      },
    }
  }

  const allUnique = new Set<HookName>([...WAVE_1, ...WAVE_2, ...WAVE_3])
  for (const name of allUnique) {
    hooks[name] = makeHook(name)
  }

  return {
    hooks,
    calls,
    recordIteration: (iter) => {
      currentIteration = iter
    },
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length))
  return sortedAsc[idx]
}

describe("tool.execute.before T1.1 (3-wave parallelized)", () => {
  test(
    "1000 sequential calls: latency profile + wave ordering invariants",
    async () => {
      //#given
      const globalOrder = { value: 0 }
      const { hooks, calls, recordIteration } = buildHooks(globalOrder)
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
        recordIteration(i)
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

      console.log(
        `T1_1_AFTER tool_execute_before ` +
          `p50_ms=${p50.toFixed(4)} ` +
          `p95_ms=${p95.toFixed(4)} ` +
          `p99_ms=${p99.toFixed(4)} ` +
          `min_ms=${min.toFixed(4)} ` +
          `max_ms=${max.toFixed(4)} ` +
          `mean_ms=${mean.toFixed(4)} ` +
          `total_ms_1000_calls=${totalMs.toFixed(4)} ` +
          `iterations=${ITERATIONS} ` +
          `hooks_per_call=${HOOKS_PER_CALL} ` +
          `waves=3 ` +
          `target_p99_ms=0.0158`,
      )

      // Structural invariants
      expect(calls.length).toBe(ITERATIONS * HOOKS_PER_CALL)

      for (let i = 0; i < calls.length; i++) {
        expect(calls[i]?.globalOrder).toBe(i)
      }

      for (let iter = 0; iter < ITERATIONS; iter++) {
        const iterCalls = calls.slice(iter * HOOKS_PER_CALL, (iter + 1) * HOOKS_PER_CALL)
        expect(iterCalls.length).toBe(HOOKS_PER_CALL)

        // Wave 1: first 5 calls, any internal order
        const w1Start = 0
        const w1End = WAVE_1.length
        const w1Names = new Set(iterCalls.slice(w1Start, w1End).map((c) => c.name))
        expect(w1Names.size).toBe(WAVE_1.length)
        for (const n of WAVE_1) expect(w1Names.has(n)).toBe(true)

        // Wave 2: next 5 calls, any internal order
        const w2Start = w1End
        const w2End = w1End + WAVE_2.length
        const w2Names = new Set(iterCalls.slice(w2Start, w2End).map((c) => c.name))
        expect(w2Names.size).toBe(WAVE_2.length)
        for (const n of WAVE_2) expect(w2Names.has(n)).toBe(true)

        // Wave 3: last 6 calls, in fixed mutator order
        const w3Start = w2End
        for (let k = 0; k < WAVE_3.length; k++) {
          expect(iterCalls[w3Start + k]?.name).toBe(WAVE_3[k])
        }

        // prometheusMdOnly appears exactly twice per iteration, once in
        // Wave 2 (one of positions 5..9) and once in Wave 3 (position 13,
        // the 4th Wave 3 entry).
        const prometheusCount = iterCalls.filter((c) => c.name === "prometheusMdOnly").length
        expect(prometheusCount).toBe(2)
      }

      // Cross-iteration isolation
      for (let i = 0; i < calls.length; i++) {
        expect(calls[i]?.iteration).toBe(Math.floor(i / HOOKS_PER_CALL))
      }

      // Sanity
      expect(p99).toBeGreaterThanOrEqual(p50)
      expect(totalMs).toBeLessThan(30_000)
    },
    30_000,
  )
})
