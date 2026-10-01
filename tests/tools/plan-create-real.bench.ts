// Real-world plan_create latency bench (committed file, run via `bun tests/tools/plan-create-real.bench.ts`).
//
// Ad-hoc alternative (issue #158): after `bun run build:tools`,
//   const { createPlanCreateTool } = await import("<repo>/dist/tools.js");
// from `ctx_execute` (language: javascript) or any ESM script. Do NOT
// `require()` `dist/index.js` — it is the OpenCode plugin bundle (ESM, ~4 MB,
// plugin-only exports) and aborts the sandbox. `dist/tools.js` is the
// side-effect-free entry (see src/tool-entry.ts).
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createPlanCreateTool } from "../../src/tools/plan/plan-create"
import { MAX_PLAN_FILE_BYTES } from "../../src/features/mission-state/constants"

const WS = "/tmp/pcreal-bench/ws"
const CAP = MAX_PLAN_FILE_BYTES

function makePlan(targetBytes: number): string {
  const head = `<!-- matrixx-plan-meta\nid: bench\nupdatedAt: 2026-01-01T00:00:00.000Z\nsessionId: bench\ntodoTotal: 400\ntodoCompleted: 0\n-->\n\n# Bench Plan\n\n`
  const task = (i: number) =>
    `- [ ] **T${i}** Do the thing number ${i} in the region with a reasonably wordy description so the file fills up realistically.\n`
  const sec = (s: number) => `\n## Section ${s}\n\n`
  let out = head
  let i = 0
  let s = 0
  while (Buffer.byteLength(out, "utf8") < targetBytes) {
    if (i % 10 === 0) {
      s++
      out += sec(s)
    }
    out += task(i++)
  }
  return out
}

async function runOnce(content: string, name: string) {
  const tool = createPlanCreateTool({ directory: WS } as never, CAP)
  const t0 = process.hrtime.bigint()
  const res = await tool.execute(
    { filePath: join(WS, ".matrixx/plans", `${name}.md`), content },
    { directory: WS, sessionID: "ses_bench" } as never,
  )
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  return { ms, res: String(res) }
}

async function main() {
  rmSync(WS, { recursive: true, force: true })
  mkdirSync(join(WS, ".matrixx/plans"), { recursive: true })

  const steps = [1_000, 10_000, 50_000, 100_000, 130_000, 139_000, 139_900, 140_500, 200_000]
  console.log(`cap = ${CAP} bytes (MAX_PLAN_FILE_BYTES)\n`)
  console.log(
    "target_bytes | actual | warmup_ms | runs (ms)                        | median | ok",
  )
  console.log("-".repeat(96))

  for (const target of steps) {
    const content = makePlan(target)
    const actual = Buffer.byteLength(content, "utf8")
    const name = `bench-${target}`

    const w = await runOnce(content, `${name}-warmup`)
    const N = 15
    const times: number[] = []
    let lastOk = false
    for (let k = 0; k < N; k++) {
      const r = await runOnce(content, `${name}-${k}`)
      times.push(r.ms)
      lastOk = r.res.includes('"success":true')
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(N / 2)]!
    console.log(
      `${String(target).padStart(12)} | ${String(actual).padStart(6)} | ${w.ms.toFixed(1).padStart(9)} | ${times
        .map((t) => t.toFixed(2).padStart(5))
        .join(" ")} | ${median.toFixed(2).padStart(6)} | ${lastOk}`,
    )
  }

  // The cap is measured on content AFTER upsertMetadataComment prepends the
  // meta block, so the effective input ceiling is `cap - metaOverhead`.
  console.log(`\n--- boundary: exact flip point (cap=${CAP}) ---`)
  for (const t of [139_000, 139_400, 139_600, 139_700, 139_750, 139_800, 139_900]) {
    const r = await runOnce(makePlan(t), `edge-${t}`)
    console.log(
      `${String(t).padStart(8)} input | ${r.res.includes('"success":true') ? "accepted" : "REJECTED size_exceeded"} | ${r.ms.toFixed(2)} ms`,
    )
  }

  console.log(`\n--- meta overhead ---`)
  const probe = makePlan(10_000)
  const tool = createPlanCreateTool({ directory: WS } as never, CAP)
  const res = String(
    await tool.execute(
      { filePath: join(WS, ".matrixx/plans", "probe.md"), content: probe },
      { directory: WS, sessionID: "ses_bench" } as never,
    ),
  )
  console.log(`input 10077 -> ${res.includes('"success":true') ? "ok" : res.slice(0, 160)}`)
}

await main()
