import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"

const TEST_ABORT = new AbortController()

export function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-read-section",
    messageID: "test-message-plan-read-section",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

export function makePlanDir(): string {
  const dir = join(tmpdir(), `plan-read-section-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  return dir
}

export function removePlanDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function writePlan(dir: string, name: string, content: string): void {
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  writeFileSync(join(dir, ".matrixx/plans", name), content, "utf-8")
}

/** Five H2/H3 sections, including the corpus's duplicated H3 spelling. */
export function buildSectionedPlan(): string {
  return [
    "# Section Fixture",
    "",
    "## TL;DR",
    "Tldr marker line.",
    "",
    "## Execution Strategy",
    "Strategy body one.",
    "Strategy body two.",
    "",
    "### Agent-Executed QA Scenarios",
    "first occurrence marker",
    "",
    "### Agent-Executed QA Scenarios",
    "second occurrence marker",
    "",
    "## TODOs",
    "- [ ] 1. first task",
    "- [ ] 2. second task",
    "",
    "## Commit Strategy",
    "Merge commit only.",
    "",
  ].join("\n")
}

/** A plan whose `## TODOs` section ALONE is over the rendered soft cap. */
export function buildOversizeSectionPlan(): string {
  const lines: string[] = ["# Oversize Fixture", "", "## TL;DR", "small.", "", "## TODOs", ""]
  for (let i = 1; i <= 900; i++) lines.push(`- [ ] ${i}. task-${i}: ${"q".repeat(50)}`)
  lines.push("", "## Commit Strategy", "done.", "")
  return `${lines.join("\n")}\n`
}

export function indexOf(content: string, id: string) {
  const entry = buildSectionIndex(content).find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`fixture has no section "${id}"`)
  return entry
}
