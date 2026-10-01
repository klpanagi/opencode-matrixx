/**
 * E2E measurement — PR #157 (per-sessionID transcript cache + isCallerOrchestrator
 * short-circuit).
 *
 * WHAT THIS MEASURES
 * ------------------
 * `plan_create`'s own body is ~1.7ms at the 140_000-byte cap (see
 * `plan-create-real.bench.ts`), so the minutes-long calls reported in issue #156
 * were never the tool. They were `client.session.messages()` round trips issued
 * by the tool.execute hook chain, which scale with SESSION LENGTH.
 *
 * PR #157 removes those fetches. This script drives the REAL
 * `createToolExecuteBeforeHandler` / `createToolExecuteAfterHandler` — the
 * production dispatch chain, not the helpers in isolation — and measures
 * wall-clock for a `plan_create` tool call under a simulated SDK backend.
 *
 * A/B DESIGN
 * ----------
 * This script measures ONLY the tree it runs against. The real pre-fix baseline
 * is obtained by running the same script inside a worktree checked out at the
 * merge base, because the short-circuit cannot be disabled at runtime — it is
 * itself part of the fix:
 *
 *   git worktree add /tmp/mx-base dev
 *   cp script/e2e-session-fetch-measurement.ts /tmp/mx-base/script/
 *   (cd /tmp/mx-base && bun script/e2e-session-fetch-measurement.ts)
 *
 * An earlier attempt faked the baseline by invalidating the cache between
 * calls. That is unsound: with the in-memory session agent populated the
 * short-circuit fires regardless of cache state, so both arms read 0 fetches.
 * Cross-revision comparison is the only honest A/B here.
 *
 * The mock client applies SIMULATED LATENCY per `session.messages()` call,
 * because real SQLite/HTTP latency cannot be reproduced locally. The absolute
 * milliseconds are therefore illustrative; the FETCH COUNTS are the hard,
 * reproducible measurement, and the ratio between configurations is the
 * meaningful output.
 *
 * Run:
 *   bun script/e2e-session-fetch-measurement.ts
 *   SESSION_FETCH_SIM_LATENCY_MS=50 bun script/e2e-session-fetch-measurement.ts
 */
/// <reference types="bun-types" />

import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Force the SQLite/SDK branch of isCallerOrchestrator before any module that
// reads it is imported. isSqliteBackend() memoizes its result at module scope.
const originalVersionCheck = process.versions
void originalVersionCheck
process.env.XDG_DATA_HOME = join(tmpdir(), "matrixx-fetch-bench-xdg")
mkdirSync(join(process.env.XDG_DATA_HOME, "opencode"), { recursive: true })
await Bun.write(join(process.env.XDG_DATA_HOME, "opencode", "opencode.db"), "")

const { mock } = await import("bun:test")
mock.module("../src/shared/opencode-storage-detection", () => ({
  isSqliteBackend: () => true,
  resetSqliteBackendCache: () => {},
}))

const { createToolExecuteBeforeHandler } = await import("../src/plugin/tool-execute-before")
const { createToolExecuteAfterHandler } = await import("../src/plugin/tool-execute-after")
const { createOracleMdOnlyHook } = await import("../src/hooks/oracle-md-only/hook")
const { createArchitectHook } = await import("../src/hooks/architect/index")
// PR #157 adds this module; it does not exist at the merge base, so the import
// is optional and the script runs unmodified on both revisions.
const { invalidateSdkMessageCache } = await import(
  "../src/features/hook-message-injector/sdk-message-cache" as string
).catch(() => ({ invalidateSdkMessageCache: null }))
const { _resetForTesting, setSessionAgent } = await import("../src/features/session-state")
const { createPlanCreateTool } = await import("../src/tools/plan/plan-create")
const { MAX_PLAN_FILE_BYTES } = await import("../src/features/mission-state/constants")

const SIM_LATENCY_MS = Number(process.env.SESSION_FETCH_SIM_LATENCY_MS ?? 25)
const WS = join(tmpdir(), "matrixx-fetch-bench-ws")
const CAP = MAX_PLAN_FILE_BYTES

// ---------------------------------------------------------------- fixtures

function makePlan(targetBytes: number): string {
  const head = `# Bench Plan\n\n`
  const task = (i: number) => `- [ ] **T${i}** Do the thing number ${i} with a reasonably wordy description.\n`
  let out = head
  let i = 0
  let s = 0
  while (Buffer.byteLength(out, "utf8") < targetBytes) {
    if (i % 10 === 0) {
      s++
      out += `\n## Section ${s}\n\n`
    }
    out += task(i++)
  }
  return out
}

type Counter = { calls: number; bytes: number }

/**
 * A client whose session.messages() behaves like a real transcript fetch:
 * latency proportional to transcript size, returning a full message list.
 * Counting the CALLS is the measurement; latency only makes it visible in ms.
 */
function makeClient(sessionBytes: number, counter: Counter) {
  const messages = Array.from({ length: 40 }, (_, i) => ({
    info: {
      id: `m${i}`,
      role: i % 2 === 0 ? "assistant" : "user",
      agent: i === 0 ? "oracle" : undefined,
      model: { providerID: "anthropic", modelID: "claude-opus-4-6" },
    },
    // Pad each message so the serialized transcript approaches sessionBytes.
    parts: [{ type: "text", text: "x".repeat(Math.floor(sessionBytes / 40)) }],
  }))

  return {
    session: {
      messages: async () => {
        counter.calls++
        counter.bytes = Buffer.byteLength(JSON.stringify(messages))
        if (SIM_LATENCY_MS > 0) await Bun.sleep(SIM_LATENCY_MS)
        return { data: messages }
      },
    },
    app: { path: { get: async () => null } },
  }
}

function buildHooks(ctx: unknown) {
  // createArchitectHook returns BOTH the before and after handlers bound to a
  // shared pendingFilePaths map, exactly as create-continuation-hooks wires it.
  const architectHook = createArchitectHook(ctx as never, {
    directory: (ctx as { directory: string }).directory,
    backgroundManager: null,
    isContinuationStopped: () => false,
    agentOverrides: undefined,
  } as never)

  return {
    oracleMdOnly: createOracleMdOnlyHook(ctx as never),
    mouseNotepad: null,
    architectHook,
  } as never
}

// ---------------------------------------------------------------- scenarios

type Row = {
  label: string
  sessionBytes: number
  planBytes: number
  calls: number
  ms: number
  transcriptBytes: number
}

async function measureOnce(opts: {
  ctx: unknown
  hooks: ReturnType<typeof buildHooks>
  planTool: ReturnType<typeof createPlanCreateTool>
  content: string
  sessionID: string
  counter: Counter
  fileSeq: number
}): Promise<number> {
  const { ctx, hooks, planTool, content, sessionID, fileSeq } = opts
  const before = createToolExecuteBeforeHandler({ ctx: ctx as never, hooks })
  const after = createToolExecuteAfterHandler({ hooks })

  const t0 = process.hrtime.bigint()
  const input = { tool: "plan_create", sessionID, callID: `call_${fileSeq}` }
  const output = { args: { filePath: join(WS, ".matrixx/plans", `e2e-${fileSeq}.md`), content } }
  await before(input, output)
  await planTool.execute(output.args as never, { directory: WS, sessionID } as never)
  await after(input, { title: "plan_create", output: "ok", metadata: {} })
  return Number(process.hrtime.bigint() - t0) / 1e6
}

async function main() {
  rmSync(WS, { recursive: true, force: true })
  mkdirSync(join(WS, ".matrixx/plans"), { recursive: true })

  console.log(`PR #157 end-to-end measurement — plan_create tool call`)
  console.log(`cap=${CAP}  simulated fetch latency=${SIM_LATENCY_MS}ms  runs/config=10\n`)

  const rows: Row[] = []
  let seq = 0

  // Two axes that drive cost: transcript size (what the fix scales with) and
  // whether chat.message populated the in-memory session agent.
  for (const [agentKnown, agentLabel] of [
    [true, "agent known"],
    [false, "agent unknown"],
  ] as const) {
    for (const sessionBytes of [20_000, 140_000, 400_000]) {
      const content = makePlan(130_000)
      const planBytes = Buffer.byteLength(content, "utf8")
      const sessionID = `ses_e2e_${agentLabel.replace(/\W+/g, "_")}_${sessionBytes}`

      const counter: Counter = { calls: 0, bytes: 0 }
      const ctx = { client: makeClient(sessionBytes, counter), directory: WS }
      const hooks = buildHooks(ctx)
      const planTool = createPlanCreateTool({ directory: WS } as never, CAP)

      const N = 10
      const times: number[] = []
      for (let k = 0; k < N; k++) {
        seq++
        if (agentKnown) setSessionAgent(sessionID, "oracle")
        else _resetForTesting()
        times.push(
          await measureOnce({
            ctx,
            hooks,
            planTool,
            content,
            sessionID,
              counter,
            fileSeq: seq,
          }),
        )
      }
      times.sort((a: number, b: number) => a - b)
      const median = times[Math.floor(N / 2)]!

      rows.push({
        label: agentLabel,
        sessionBytes,
        planBytes,
        calls: counter.calls,
        ms: median,
        transcriptBytes: counter.bytes,
      })
    }
  }

  console.log("config          | transcript  | plan    | fetches/10 calls | median ms | payload")
  console.log("-".repeat(84))
  for (const r of rows) {
    console.log(
      `${r.label.padEnd(15)} | ${String(r.sessionBytes).padStart(10)} | ${String(r.planBytes).padStart(6)} | ${String(r.calls).padStart(16)} | ${r.ms.toFixed(1).padStart(9)} | ${(r.transcriptBytes / 1024).toFixed(0)} KB`,
    )
  }

  console.log(`\nFETCH COUNT IS THE HARD MEASUREMENT. ms is median wall-clock per tool call.`)
  console.log(`Simulated ${SIM_LATENCY_MS}ms/fetch; real SQLite/HTTP latency is higher, so ms understates the win.`)
  console.log(`\nBaseline: run this same script in a worktree checked out at the merge base.`)
  console.log(`  git worktree add /tmp/mx-base dev`)
  console.log(`  cp script/e2e-session-fetch-measurement.ts /tmp/mx-base/script/`)
  console.log(`  (cd /tmp/mx-base && bun script/e2e-session-fetch-measurement.ts)`)

  rmSync(WS, { recursive: true, force: true })
}

await main()
