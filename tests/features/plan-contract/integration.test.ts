/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ARCHITECT_SYSTEM_PROMPT } from "../../../src/agents/architect/default"
import { ARCHITECT_GPT_SYSTEM_PROMPT } from "../../../src/agents/architect/gpt"
import { CANONICAL_SECTIONS, REQUIRED_TASK_SUBFIELDS, validatePlanContract } from "../../../src/features/plan-contract"
import { countPlanProgressFromContent, readPlanFile } from "../../../src/features/mission-state"
import { buildOrchestratorReminder } from "../../../src/hooks/architect/verification-reminders"
import { createTaskEditGuardHook } from "../../../src/hooks/task-edit-guard"
import { PLAN_READ_WARN, PLAN_WRITE_WARN } from "../../../src/hooks/task-edit-guard/constants"
import {
  MAX_PLAN_FILE_BYTES,
  MAX_PLAN_READ_RENDERED_BYTES,
  PLAN_FILENAME_KEBAB_REGEX,
  PLANS_DIR,
} from "../../../src/tools/plan/constants"
import { createPlanCreateTool } from "../../../src/tools/plan/plan-create"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanTasksTool } from "../../../src/tools/plan/plan-tasks"

/**
 * End-to-end integration for the dedicated plan tools.
 *
 * `.matrixx/plans/` is gitignored, so every scenario that targets a real repo
 * plan degrades gracefully: when the file is absent (CI), an equivalent
 * temp-dir fixture is synthesized with the SAME asserted properties — never a
 * vacuous pass, never a hard failure on absence.
 */

const TEST_ABORT = new AbortController()

function testContext(directory: string) {
  return {
    sessionID: "test-session-plan-integration",
    messageID: "test-message-plan-integration",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory,
  }
}

function writePlan(root: string, name: string, content: string): string {
  const dir = join(root, PLANS_DIR)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, name)
  writeFileSync(filePath, content, "utf-8")
  return filePath
}

function repoPlanPath(name: string): string {
  return join(process.cwd(), PLANS_DIR, name)
}

/** Numbered-task plan used when the gitignored repo corpus is absent (CI). */
function buildNumberedPlan(taskCount: number, completedCount: number): string {
  const lines = ["# Synthesized Numbered Plan", ""]
  for (let i = 1; i <= taskCount; i++) {
    lines.push(`- [${i <= completedCount ? "x" : " "}] ${i}. Task ${i}`)
  }
  return `${lines.join("\n")}\n`
}

/** Synthesized CI fixture (repo fixture is gitignored): 480 lines ≈ 33.4KB rendered, under the 40,000 soft cap. */
function buildNearCapContent(): string {
  const lines: string[] = ["# Near Cap Plan", "", "## Section One", ""]
  for (let i = 1; i <= 480; i++) {
    lines.push(`- [ ] ${i}. task-${i}: ${"z".repeat(40)}`)
  }
  return `${lines.join("\n")}\n`
}

/** ~63KB body (under the hard cap): the selected payload exceeds the soft cap. */
function buildOverCapContent(): string {
  const lines: string[] = ["# Over Cap Plan", "", "## Section One", ""]
  for (let i = 1; i <= 900; i++) {
    if (i % 100 === 0) lines.push(`## Section ${i / 100}`)
    lines.push(`- [ ] ${i}. task-${i}: ${"q".repeat(50)}`)
  }
  return `${lines.join("\n")}\n`
}

/** 8 canonical H2 sections + 12 numbered tasks, each carrying all required subfields. */
function buildSelfConformantPlan(): string {
  const lines: string[] = ["# Synthesized Self-Conformant Plan", ""]
  for (const section of CANONICAL_SECTIONS) {
    lines.push(`## ${section}`, "")
    if (section !== "TODOs") continue
    for (let i = 1; i <= 12; i++) {
      lines.push(`- [ ] ${i}. Synthesized task ${i}`, "")
      for (const label of REQUIRED_TASK_SUBFIELDS) {
        lines.push(`  **${label}**:`, `  - detail ${i}`, "")
      }
    }
  }
  return `${lines.join("\n")}\n`
}

describe("plan-tool chain — end-to-end integration", () => {
  let tmp: string

  beforeEach(() => {
    tmp = join(tmpdir(), `plan-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(tmp, PLANS_DIR), { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  })

  // (a) plan_tasks manifest agrees with the mission-state SSOT for the corpus.
  test("(a) plan_tasks task count agrees with countPlanProgressFromContent", async () => {
    //#given every valid-kebab repo plan under the cap, else synthesized fixtures
    const tool = createPlanTasksTool()
    const repoDir = join(process.cwd(), PLANS_DIR)
    const repoFiles = existsSync(repoDir)
      ? readdirSync(repoDir).filter((f) => f.endsWith(".md") && PLAN_FILENAME_KEBAB_REGEX.test(f))
      : []
    const cases: Array<{ root: string; filePath: string; content: string }> = []
    for (const fileName of repoFiles) {
      const content = readPlanFile(repoPlanPath(fileName))
      if (content === null) continue // over the cap / unreadable — excluded by definition
      cases.push({ root: process.cwd(), filePath: join(PLANS_DIR, fileName), content })
    }
    if (cases.length === 0) {
      const synth = [
        { name: "synth-numbered-a.md", content: buildNumberedPlan(3, 1) },
        { name: "synth-numbered-b.md", content: buildNumberedPlan(2, 2) },
        { name: "synth-unnumbered.md", content: "# Legacy Plan\n\n- [ ] one\n- [x] two\n" },
      ]
      for (const s of synth) {
        writePlan(tmp, s.name, s.content)
        cases.push({ root: tmp, filePath: join(PLANS_DIR, s.name), content: s.content })
      }
    }
    expect(cases.length).toBeGreaterThan(0)

    //#when each plan is read through plan_tasks
    for (const c of cases) {
      const manifest = JSON.parse(
        await tool.execute({ filePath: c.filePath }, testContext(c.root)).then((__r) => __r.content),
      ) as {
        progress: { total: number; completed: number; remaining: number }
        tasks: unknown[]
      }
      const progress = countPlanProgressFromContent(c.content)

      //#then progress mirrors the SSOT exactly
      expect(manifest.progress.total).toBe(progress.total)
      expect(manifest.progress.completed).toBe(progress.completed)
      expect(manifest.progress.remaining).toBe(progress.total - progress.completed)

      //#then the task count equals the SSOT total whenever numbered tasks exist
      if (manifest.tasks.length > 0) {
        expect(manifest.tasks.length).toBe(progress.total)
      }
    }
  })

  // (b) plan_read renders under the soft cap for the near-cap repo fixture.
  test("(b) plan_read single-format payload for evolution-advancement-proposal.md is under 40000", async () => {
    //#given the repo fixture when present, else an equivalent near-cap synthesized file
    const tool = createPlanReadTool()
    const repoFile = repoPlanPath("evolution-advancement-proposal.md")
    const content = existsSync(repoFile) ? readFileSync(repoFile, "utf-8") : buildNearCapContent()
    writePlan(tmp, "evolution-advancement-proposal.md", content)

    //#when read with the default format
    const res = JSON.parse(
      await tool.execute(
        { filePath: join(PLANS_DIR, "evolution-advancement-proposal.md") },
        testContext(tmp),
      ).then((__r) => __r.content),
    ) as Record<string, unknown>

    //#then exactly one payload is returned and it fits the soft cap
    expect(res.truncated).toBeUndefined()
    expect("hashline" in res).toBe(true)
    expect("content" in res).toBe(false)
    expect(JSON.stringify(res).length).toBeLessThan(MAX_PLAN_READ_RENDERED_BYTES)
  })

  // (c) truncation path: an over-soft-cap plan returns outline + hint, no payload.
  test("(c) over-soft-cap plan returns truncated + outline + hint and neither payload", async () => {
    //#given this repository's own plan when present, else a synthesized over-cap plan
    const tool = createPlanReadTool()
    const repoFile = repoPlanPath("plan-contract-and-dedicated-tools.md")
    const content = existsSync(repoFile) ? readFileSync(repoFile, "utf-8") : buildOverCapContent()
    writePlan(tmp, "plan-contract-and-dedicated-tools.md", content)

    //#when read with the default format
    const res = JSON.parse(
      await tool.execute(
        { filePath: join(PLANS_DIR, "plan-contract-and-dedicated-tools.md") },
        testContext(tmp),
      ).then((__r) => __r.content),
    ) as Record<string, unknown>

    //#then the truncation envelope carries outline + hint and NO body
    expect(res.truncated).toBe(true)
    expect("content" in res).toBe(false)
    expect("hashline" in res).toBe(false)
    expect(Array.isArray(res.outline)).toBe(true)
    expect((res.outline as unknown[]).length).toBeGreaterThan(0)
    expect(typeof res.hint).toBe("string")
  })

  // (d) plan_create rejects content over the hard cap.
  test("(d) plan_create over 102400 bytes returns size_exceeded and writes nothing", async () => {
    //#given an oversized plan payload
    const tool = createPlanCreateTool()
    const filePath = join(PLANS_DIR, "oversized-plan.md")

    //#when created
    const res = JSON.parse(
      await tool.execute({ filePath, content: "x".repeat(MAX_PLAN_FILE_BYTES + 1) }, testContext(tmp)).then((__r) => __r.content),
    ) as { error?: string }

    //#then the size guard rejects it and nothing is persisted
    expect(res.error).toBe("size_exceeded")
    expect(existsSync(join(tmp, filePath))).toBe(false)
  })

  // (e) architect prompts/reminder are bound to plan_tasks + plan_read.
  const architectTexts: Array<{ name: string; value: string }> = [
    { name: "ARCHITECT_SYSTEM_PROMPT", value: ARCHITECT_SYSTEM_PROMPT },
    { name: "ARCHITECT_GPT_SYSTEM_PROMPT", value: ARCHITECT_GPT_SYSTEM_PROMPT },
    {
      name: "buildOrchestratorReminder",
      value: buildOrchestratorReminder("plan-contract-and-dedicated-tools", { total: 3, completed: 1 }, "ses_test"),
    },
  ]
  for (const { name, value } of architectTexts) {
    test(`(e) ${name} names plan_tasks + plan_read and omits Read-on-plan forms`, () => {
      //#given the architect text
      //#when inspected for plan-tool binding
      //#then sanctioned plan tools are present
      expect(value).toContain("plan_tasks")
      expect(value).toContain("plan_read")

      //#then no generic Read call or prose on a plan path remains
      expect(/Read\(\s*["'`]\.matrixx\/plans/.test(value)).toBe(false)
      expect(/Read the plan file/i.test(value)).toBe(false)
    })
  }

  // (f) task-edit-guard blocks generic Read on plans with PLAN_READ_WARN.
  test("(f) task-edit-guard throws PLAN_READ_WARN for a generic read on a plan", async () => {
    //#given non-empty guard constants and the guard hook
    expect(typeof PLAN_READ_WARN).toBe("string")
    expect(PLAN_READ_WARN.length).toBeGreaterThan(0)
    expect(typeof PLAN_WRITE_WARN).toBe("string")
    expect(PLAN_WRITE_WARN.length).toBeGreaterThan(0)
    const hook = createTaskEditGuardHook({ directory: tmp } as unknown as PluginInput)

    //#when a generic read targets .matrixx/plans/x.md
    const input = { tool: "read", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath: join(PLANS_DIR, "x.md") } }
    const result = hook["tool.execute.before"]?.(input, output)

    //#then the guard blocks with the plan_read redirect warning
    await expect(result).rejects.toThrow(PLAN_READ_WARN)
  })

  // (g) self-conformance of this plan (8 canonical H2 sections, 12 numbered tasks).
  test("(g) validatePlanContract reports zero missing sections, 8 H2s and 12 numbered tasks", () => {
    //#given this plan when present, else a synthesized 8-H2 / 12-task equivalent
    const repoFile = repoPlanPath("plan-contract-and-dedicated-tools.md")
    const usingRepo = existsSync(repoFile)
    const content = usingRepo ? readFileSync(repoFile, "utf-8") : buildSelfConformantPlan()

    //#when validated
    const result = validatePlanContract(content)
    const lines = content.split("\n")
    const h2Count = lines.filter((l) => /^##\s+/.test(l)).length
    const numberedCount = lines.filter((l) => /^[-*]\s*\[[ xX]\]\s*\d+\./.test(l)).length

    //#then the contract is self-conformant
    expect(result.warnings.filter((w) => w.code === "missing_section")).toEqual([])
    expect(h2Count).toBe(8)
    expect(numberedCount).toBe(12)
  })
})
