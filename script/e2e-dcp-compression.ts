/**
 * E2E verification that DCP auto-triggered compression fires autonomously
 * in a headless agentic session.
 *
 * Usage:
 *   bun run script/e2e-dcp-compression.ts [--skip-headless] [--keep-profile]
 *     [--timeout-ms 240000] [--max-turns 5] [--model provider/model]
 *
 * What it verifies:
 *   [1] Static: `min-band-test` profile exists in ~/.config/opencode/matrixx.jsonc
 *       with max 10% / min 5% (aggressive enough to fire early).
 *   [2] Switch: switchProfile('min-band-test') regenerates ~/.config/opencode/dcp.jsonc
 *       with maxContextLimit 10% / minContextLimit 5% (backup + restore).
 *   [3] Armed: resolveDcpCompressionMode() === "guided" (auto-mode, not manual/none),
 *       permission "allow", manualMode disabled — i.e. the autonomous path is armed.
 *   [4] Headless agentic, MULTI-TURN: one `opencode run` session continued with `-s`
 *       across up to --max-turns turns of context-inflating prompts that NEVER mention
 *       "compress" — any `compress` tool call in the cumulative JSON event stream is
 *       therefore autonomous, not instructed. PASS requires a compress tool event or
 *       a "[Compressed conversation section]" marker. Stops early on first evidence.
 *
 * Headless limitation: TUI toasts never render headless; JSON tool events are the
 * proxy. For full UX proof (toast + detailed prune message), run the live TUI script.
 *
 * Exit codes: 0 = PASS (or static-PASS with headless skipped), 1 = FAIL, 2 = INCONCLUSIVE
 * (static checks passed but no autonomous compress observed in the headless window).
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { parse as parseJsonc } from "jsonc-parser"

import { switchProfile } from "../src/shared/dcp-switch-profile.ts"
import { resolveDcpCompressionMode } from "../src/shared/dcp-guidance.ts"

const PROFILE = "min-band-test"
const EXPECTED_MAX = "10%"
const EXPECTED_MIN = "5%"

const MATRIXX_JSONC = join(homedir(), ".config", "opencode", "matrixx.jsonc")
const DCP_JSONC = join(homedir(), ".config", "opencode", "dcp.jsonc")

// Context-inflating prompt. MUST NOT contain the word "compress" (any case) —
// that is what makes an observed compress tool call proof of autonomy.
const INFLATION_PROMPT = [
  "Read src/shared/dcp-switch-profile.ts, src/config/schema/dcp.ts and src/shared/dcp-guidance.ts,",
  "then find every other file in src/ whose path contains dcp, read each one,",
  "and explain in detail how profile switching flows from matrixx.jsonc to dcp.jsonc.",
  "After that, read src/index.ts, src/create-hooks.ts and src/plugin-config.ts and extend the explanation",
  "with how the startup auto-switch works. Be thorough and use many tool calls; do not summarize prematurely.",
].join(" ")

const FOLLOWUP_PROMPTS = [
  "Continue the analysis: read everything under src/hooks/context-window-monitor/ and src/features/evolution/, then add a section on how context monitoring interacts with profile switching. Use many tool calls and be thorough.",
  "Keep going: read tests/shared/dcp-switch-profile.test.ts, tests/shared/dcp-guidance.test.ts and src/tools/preset/tools.ts in full, then extend the report with how the preset tool and the test suites relate to profile switching. Re-read any earlier file you need for precision.",
  "Continue: read src/plugin-config.ts, src/create-tools.ts and src/create-managers.ts in full and describe the complete plugin startup sequence end to end, including where the DCP profile gets activated. Be exhaustive.",
  "Consolidate everything so far into one structured report with per-file summaries. For every file, re-read the sections you are least sure about before writing its summary. Do not wrap up early.",
  "Review the consolidated report for gaps: re-read the three largest files covered above in full and fill in every missing detail. Quote the key functions and their roles.",
  "Final pass: re-read src/shared/dcp-switch-profile.ts and src/config/schema/dcp.ts once more and append a precise field-by-field account of every profile parameter and its effect. Leave nothing out.",
]

function parseArgs(argv: string[]) {
  return {
    skipHeadless: argv.includes("--skip-headless"),
    keepProfile: argv.includes("--keep-profile"),
    timeoutMs: Number(argv.find((a) => a.startsWith("--timeout-ms="))?.split("=")[1] ?? 240000),
    maxTurns: Number(argv.find((a) => a.startsWith("--max-turns="))?.split("=")[1] ?? 5),
    model: argv.find((a) => a.startsWith("--model="))?.split("=")[1],
  }
}

async function runTurn(
  prompt: string,
  opts: { sessionId?: string; timeoutMs: number; model?: string },
): Promise<{ stdout: string; timedOut: boolean }> {
  const args = ["run", "--format", "json", "--dir", process.cwd()]
  if (opts.sessionId) args.push("--session", opts.sessionId)
  if (opts.model) args.push("--model", opts.model)
  args.push(prompt)
  const proc = Bun.spawn(["opencode", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  })
  const stdoutChunks: Uint8Array[] = []
  const reader = proc.stdout.getReader()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try { proc.kill() } catch { /* already exited */ }
  }, opts.timeoutMs)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) stdoutChunks.push(value)
      if (timedOut) break
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
  await proc.exited.catch(() => {})
  const stdout = Buffer.concat(stdoutChunks).toString("utf-8")
  return { stdout, timedOut }
}

function extractSessionId(stdout: string): string | undefined {
  const match = stdout.match(/ses_[A-Za-z0-9]+/)
  return match?.[0]
}

interface CompressEvidence {
  compressToolEvents: number
  compressedSectionMarkers: number
  pruneOrSummaryHints: number
}

function scanEvidence(stdout: string): CompressEvidence {
  // 1. Structured: JSON events with tool === "compress"
  let compressToolEvents = 0
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("{")) continue
    try {
      const evt = JSON.parse(trimmed)
      const hay = JSON.stringify(evt)
      if (/\"tool\"\s*:\s*\"compress\"/.test(hay)) compressToolEvents++
    } catch { /* non-JSON line */ }
  }
  // 2. Raw fallbacks (whole-stream, covers pretty-printed JSON too)
  if (compressToolEvents === 0 && /\"tool\"\s*:\s*\"compress\"/.test(stdout)) compressToolEvents = 1
  const compressedSectionMarkers = (stdout.match(/\[Compressed conversation section\]/g) ?? []).length
  const pruneOrSummaryHints = (
    stdout.match(/pruneNotification|compression summary|compress.*complet|purgeErrors/gi) ?? []
  ).length
  return { compressToolEvents, compressedSectionMarkers, pruneOrSummaryHints }
}

async function main() {
  const { skipHeadless, keepProfile, timeoutMs, maxTurns, model } = parseArgs(process.argv.slice(2))
  console.log("=== E2E DCP Compression (headless, multi-turn) ===")
  let failed = false
  let inconclusive = false
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`PASS: ${msg}`)
    }
  }

  // Autonomy guard: no prompt may instruct compression.
  const allPrompts = [INFLATION_PROMPT, ...FOLLOWUP_PROMPTS]
  assert(
    allPrompts.every((p) => !/compress/i.test(p)),
    "no prompt contains 'compress' (autonomy guard)",
  )

  // [1] Static: min-band-test profile in matrixx.jsonc
  console.log("\n[1] min-band-test profile in matrixx.jsonc")
  assert(existsSync(MATRIXX_JSONC), `matrixx.jsonc exists at ${MATRIXX_JSONC}`)
  const raw = existsSync(MATRIXX_JSONC) ? readFileSync(MATRIXX_JSONC, "utf-8") : "{}"
  const errors: Array<{ error: unknown; offset: number }> = []
  const parsed = parseJsonc(raw, errors, { allowTrailingComma: true, disallowComments: false }) as any
  assert(errors.length === 0, "matrixx.jsonc parses as JSONC")
  const profile = parsed?.dcp?.profiles?.[PROFILE]
  assert(!!profile, `"dcp.profiles.${PROFILE}" exists`)
  assert(profile?.compress?.maxContextLimit === EXPECTED_MAX, `maxContextLimit === ${EXPECTED_MAX}`)
  assert(profile?.compress?.minContextLimit === EXPECTED_MIN, `minContextLimit === ${EXPECTED_MIN}`)
  assert((profile?.compress?.nudgeFrequency ?? 0) <= 1, "nudgeFrequency <= 1 (fires early)")
  assert((profile?.compress?.iterationNudgeThreshold ?? 0) <= 1, "iterationNudgeThreshold <= 1 (fires early)")

  // [2] Switch: dcp.jsonc regenerates to 10%/5% (backup + restore)
  console.log("\n[2] switchProfile regenerates dcp.jsonc")
  const backupPath = join(tmpdir(), `dcp.jsonc.e2e-backup-${Date.now()}`)
  const hadDcp = existsSync(DCP_JSONC)
  if (hadDcp) copyFileSync(DCP_JSONC, backupPath)
  try {
    const msg = switchProfile(PROFILE, { pluginConfig: parsed })
    assert(!msg.startsWith("Error"), `switchProfile('${PROFILE}') accepted: ${msg.split("\n")[0]}`)
    const generated = existsSync(DCP_JSONC) ? readFileSync(DCP_JSONC, "utf-8") : ""
    assert(generated.includes(`"maxContextLimit": "${EXPECTED_MAX}"`), "dcp.jsonc has max 10%")
    assert(generated.includes(`"minContextLimit": "${EXPECTED_MIN}"`), "dcp.jsonc has min 5%")

    // [3] Armed: guided auto-mode, permission allow, manualMode off
    console.log("\n[3] autonomous path armed (guided auto-mode)")
    assert(resolveDcpCompressionMode() === "guided", 'resolveDcpCompressionMode() === "guided"')
    const genErrors: Array<{ error: unknown; offset: number }> = []
    const genParsed = parseJsonc(generated || "{}", genErrors) as any
    assert(genErrors.length === 0, "generated dcp.jsonc parses")
    assert(genParsed?.compress?.permission === "allow", 'compress.permission === "allow"')
    assert(genParsed?.manualMode?.enabled === false, "manualMode disabled")

    // [4] Headless multi-turn agentic session
    if (skipHeadless) {
      console.log("\n[4] headless agentic session SKIPPED (--skip-headless)")
    } else {
      console.log(`\n[4] headless multi-turn session (up to ${maxTurns} turns, ${timeoutMs}ms each)`)
      let sessionId: string | undefined
      let cumulative = ""
      let fired = false
      const turns = Math.min(Math.max(maxTurns, 1), 1 + FOLLOWUP_PROMPTS.length)
      for (let turn = 1; turn <= turns; turn++) {
        const prompt = turn === 1 ? INFLATION_PROMPT : FOLLOWUP_PROMPTS[turn - 2]!
        console.log(`--- turn ${turn}/${turns}${sessionId ? ` (session ${sessionId})` : " (new session)"} ---`)
        const { stdout, timedOut } = await runTurn(prompt, { sessionId, timeoutMs, model })
        if (!sessionId) {
          sessionId = extractSessionId(stdout)
          if (!sessionId) {
            console.error("FAIL: could not extract session id from turn 1 output — cannot continue multi-turn")
            failed = true
            break
          }
        }
        cumulative += `\n${stdout}`
        const evidence = scanEvidence(cumulative)
        console.log(
          `turn ${turn}: ${stdout.length} bytes (cumulative ${cumulative.length}), timedOut=${timedOut}, ` +
            `compressToolEvents=${evidence.compressToolEvents}, ` +
            `compressedMarkers=${evidence.compressedSectionMarkers}, hints=${evidence.pruneOrSummaryHints}`,
        )
        if (process.env.DCP_E2E_DUMP === "1") {
          const dumpPath = join(tmpdir(), `dcp-e2e-turn${turn}-${Date.now()}.log`)
          writeFileSync(dumpPath, stdout)
          console.log(`turn ${turn} output dumped to ${dumpPath}`)
        }
        if (evidence.compressToolEvents > 0 || evidence.compressedSectionMarkers > 0) {
          fired = true
          console.log(`PASS: autonomous compress observed on turn ${turn}`)
          break
        }
        if (timedOut) {
          console.error(`FAIL: turn ${turn} timed out with no compress evidence`)
          failed = true
          break
        }
      }
      if (!failed) {
        if (fired) {
          console.log("PASS: autonomous compress fired within the multi-turn window")
        } else {
          const evidence = scanEvidence(cumulative)
          console.warn(
            `INCONCLUSIVE: no autonomous compress after multi-turn inflation ` +
              `(cumulative ${cumulative.length} bytes, hints=${evidence.pruneOrSummaryHints}).`,
          )
          inconclusive = true
        }
      }
    }
  } finally {
    if (keepProfile) {
      console.log(`\n(keeping test profile active in dcp.jsonc; backup at ${hadDcp ? backupPath : "n/a"})`)
    } else if (hadDcp) {
      copyFileSync(backupPath, DCP_JSONC)
      rmSync(backupPath, { force: true })
      console.log("\n(restored original dcp.jsonc)")
    }
  }

  console.log("\n=== RESULT ===")
  if (failed) {
    console.error("E2E DCP COMPRESSION FAILED")
    process.exit(1)
  }
  if (inconclusive) {
    console.warn("E2E DCP COMPRESSION INCONCLUSIVE (static PASS, no autonomous compress observed)")
    process.exit(2)
  }
  console.log("E2E DCP COMPRESSION ALL PASS ✓")
}

main().catch((e) => {
  console.error("E2E DCP COMPRESSION ERROR:", e)
  process.exit(1)
})
