import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"

const TEST_ABORT = new AbortController()

export function testContext(testDir: string) {
  return {
    sessionID: "test-session-plan-update-section",
    messageID: "test-message-plan-update-section",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  }
}

export function makePlanDir(): string {
  const dir = join(tmpdir(), `plan-update-section-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(join(dir, ".matrixx/plans"), { recursive: true })
  return dir
}

export function removePlanDir(dir: string): void {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function planFile(testDir: string, name: string): string {
  return join(testDir, ".matrixx/plans", name)
}

export function writePlan(testDir: string, name: string, content: string): string {
  const path = planFile(testDir, name)
  mkdirSync(join(testDir, ".matrixx/plans"), { recursive: true })
  writeFileSync(path, content, "utf-8")
  return path
}

export function readPlan(testDir: string, name: string): string {
  return readFileSync(planFile(testDir, name), "utf-8")
}

/** md5 of the file's BYTES — the "the file was not touched" assertion. */
export function md5OfFile(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex")
}

/**
 * Four blank-separated H2 sections. Front matter is PRESENT on purpose: the
 * first `plan_update` injects it, which shifts every section's `startLine` and
 * would (correctly) change every section hash. A section-hash stability test
 * must isolate the section edit from that unrelated whole-file shift.
 */
export function buildSectionedPlan(): string {
  const body = [
    "# Section Fixture",
    "",
    "## TL;DR",
    "Tldr marker line.",
    "",
    "## Execution Strategy",
    "Strategy body one.",
    "Strategy body two.",
    "",
    "## TODOs",
    "- [ ] 1. first task",
    "- [ ] 2. second task",
    "",
    "## Commit Strategy",
    "Merge commit only.",
    "",
  ].join("\n")
  return `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${body}`
}

export function indexOf(content: string, id: string) {
  const entry = buildSectionIndex(content).find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`fixture has no section "${id}"`)
  return entry
}

export function hashOf(content: string, id: string): string {
  return indexOf(content, id).contentHash
}

/** `{ id: contentHash }` for every section, for whole-file comparisons. */
export function allHashes(content: string): Record<string, string> {
  return Object.fromEntries(buildSectionIndex(content).map((entry) => [entry.id, entry.contentHash]))
}

/** The first `N#ID` anchor of a hashline payload row containing `needle`. */
export function anchorIn(hashline: string, needle: string): string {
  const row = hashline.split("\n").find((line) => line.includes(needle))
  if (!row) throw new Error(`no hashline row contains: ${needle}`)
  return row.split("|")[0] as string
}
