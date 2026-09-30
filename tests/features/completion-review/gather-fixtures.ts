/// <reference types="bun-types" />
/**
 * Task 2 — real-file fixtures for the deterministic gatherer.
 *
 * Every path is derived from `mkdtempSync(join(tmpdir(), ...))`. No absolute
 * `/tmp` literal appears in any golden string: `tmpdir()` honours `$TMPDIR`, so
 * a hard-coded path passes locally and breaks in CI.
 *
 * `mkdirSync` / `writeFileSync` live HERE, in tests, because the repo
 * convention forbids file-creation primitives in TypeScript source. The
 * gatherer itself creates nothing.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

export function makeTempRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `matrixx-gather-${label}-`))
}

export function writeFile(root: string, relativePath: string, content: string): string {
  const absolute = join(root, relativePath)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content, "utf-8")
  return absolute
}

export function removeTempRoot(root: string): void {
  rmSync(root, { recursive: true, force: true })
}

/** Oracle-format plan: numbered task lines plus a Definition-of-Done block. */
export function numberedPlan(options?: { checked?: number; total?: number }): string {
  const checked = options?.checked ?? 1
  const total = options?.total ?? 3
  const lines: string[] = ["# Fixture Plan", "", "## TODOs", ""]
  for (let n = 1; n <= total; n++) {
    lines.push(n <= checked ? `- [x] ${n}. task number ${n}` : `- [ ] ${n}. task number ${n}`)
  }
  lines.push("", "## Definition of Done", "")
  for (let n = 1; n <= 2; n++) lines.push(`- [x] acceptance criterion ${n}`)
  lines.push("")
  return lines.join("\n")
}

/** Prose-only plan: zero checkboxes anywhere. */
export function zeroCheckboxPlan(): string {
  return ["# Vacuous Plan", "", "## TODOs", "", "Written as prose; no checkboxes at all.", ""].join("\n")
}

export interface NotepadOptions {
  taskId: string
  subject?: string
  stamped?: boolean
  results?: string
}

export function notepadContent(options: NotepadOptions): string {
  const sections = [
    "# Task: " + (options.subject ?? "fixture task"),
    "",
    `**Task ID**: ${options.taskId}`,
    "**Priority**: medium",
    "**Status**: completed",
    "**Started**: 2026-01-01T00:00:00.000Z",
    "",
    "## Findings",
    "",
    "(nothing recorded)",
    "",
    "## Results",
    "",
    options.results ?? "Did the thing.",
    "",
  ]
  if (options.stamped) {
    sections.push("## Completion", "- completed_at: 2026-01-02T00:00:00.000Z", "- status: completed", "")
  }
  return sections.join("\n")
}

/**
 * A `T-*.json` runtime task. `TaskSchema` is `.strict()` with NO plan foreign
 * key — the only plan linkage is the `metadata.planName` convention, which is
 * why the gatherer labels it `heuristic`.
 */
export function runtimeTaskFile(options: {
  id: string
  subject: string
  status: string
  planName?: string
  threadID?: string
  projectRoot?: string
}): Record<string, unknown> {
  return {
    id: options.id,
    subject: options.subject,
    description: "",
    status: options.status,
    activeForm: "",
    blocks: [],
    blockedBy: [],
    priority: "medium",
    // `TaskObjectSchema` requires a threadID string, and is `.strict()`.
    threadID: options.threadID ?? "ses-fixture",
    projectRoot: options.projectRoot,
    ...(options.planName === undefined ? {} : { metadata: { planName: options.planName } }),
  }
}
