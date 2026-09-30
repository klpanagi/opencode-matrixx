/// <reference types="bun-types" />
/**
 * Task 8 — notepad-backed evidence source.
 *
 * The corpus in `.matrixx/evidence/` predates any capture helper: no program in
 * this repo writes there, so every existing file is CONVENTION ONLY. The only
 * machine-written trail is `.matrixx/notepads/`, produced by
 * `task-notepad-writer`. These tests pin both facts:
 *
 *  - a machine-written notepad parses (Task ID marker + `## Completion` stamp)
 *  - a DoD item with no evidence resolves to `unverifiable`, never `pass`
 *
 * Real files under a `mkdtempSync(join(tmpdir(), ...))` root — no
 * `mock.module()`, so this file stays out of the mock-heavy list. Every path is
 * derived from `tmpdir()` (never a hardcoded `/tmp`) because `$TMPDIR` differs
 * in CI.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildCaptureCommand, parseCaptureRecord } from "../../../src/features/completion-review/evidence-capture"
import { parseNotepad } from "../../../src/features/completion-review/evidence-notepad"
import { resolveDoDEvidence } from "../../../src/features/completion-review/evidence-resolve"
import { EVIDENCE_PROVENANCE } from "../../../src/features/completion-review/evidence-types"

let root = ""

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "completion-review-evidence-"))
  mkdirSync(join(root, "notepads", "some-plan"), { recursive: true })
  mkdirSync(join(root, "evidence"), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeNotepad(name: string, content: string): void {
  writeFileSync(join(root, "notepads", "some-plan", name), content, "utf-8")
}

describe("parseNotepad", () => {
  test("finds the **Task ID** marker and the ## Completion stamp", () => {
    //#given a notepad exactly as task-notepad-writer renders it
    const content = [
      "# Task: T1 do the thing",
      "",
      "**Task ID**: T-abc",
      "**Priority**: high",
      "**Status**: pending",
      "**Started**: 2026-09-29T16:22:39.737Z",
      "",
      "## Findings",
      "",
      "(notes)",
      "",
      "## Completion",
      "- completed_at: 2026-09-29T17:35:28.097Z",
      "- status: completed",
      "",
    ].join("\n")

    //#when the parser reads it
    const parsed = parseNotepad(content)

    //#then both machine-written markers are found
    expect(parsed.taskId).toBe("T-abc")
    expect(parsed.completed).toBe(true)
  })

  test("reports completed=false when the Completion stamp is absent", () => {
    //#given a notepad with only the fixed section headings
    const content = ["# Task: T2", "", "**Task ID**: T-def", "", "## Results", "", "(pending)"].join("\n")

    //#when the parser reads it
    const parsed = parseNotepad(content)

    //#then it is machine-written but not completed
    expect(parsed.taskId).toBe("T-def")
    expect(parsed.completed).toBe(false)
  })

  test("reads a real on-disk notepad written by the hook", () => {
    //#given a notepad file on disk with the hook's exact rendering
    writeNotepad(
      "0-a.md",
      [
        "# Task: real",
        "",
        "**Task ID**: T-real-1",
        "**Priority**: medium",
        "**Status**: pending",
        "**Started**: 2026-09-29T00:00:00.000Z",
        "",
        "## Completion",
        "- completed_at: 2026-09-29T01:00:00.000Z",
        "- status: completed",
        "",
      ].join("\n"),
    )

    //#when the on-disk bytes are parsed
    const parsed = parseNotepad(readFileSync(join(root, "notepads", "some-plan", "0-a.md"), "utf-8"))

    //#then the marker resolves
    expect(parsed.taskId).toBe("T-real-1")
    expect(parsed.completed).toBe(true)
  })
})

let NOTEPAD_BYTES = ""

describe("resolveDoDEvidence", () => {
  test("a completing notepad plus an evidence file is a positive outcome", () => {
    //#given a machine-written completion and one convention evidence file
    const input = {
      itemId: "dod-1",
      notepad: { taskId: "T-abc", completed: true },
      evidenceFiles: ["task-1-run.txt"],
    }

    //#when the item is resolved
    const result = resolveDoDEvidence(input)

    //#then it passes with machine-written provenance
    expect(result.outcome).toBe("pass")
    expect(result.provenance).toBe(EVIDENCE_PROVENANCE.NOTEPAD)
  })

  test("an item with NO evidence is unverifiable, not pass and not fail", () => {
    //#given a DoD item with neither notepad nor evidence file
    const input = { itemId: "dod-2", notepad: null, evidenceFiles: [] as string[] }

    //#when the item is resolved
    const result = resolveDoDEvidence(input)

    //#then it is unverifiable and carries the "none" provenance
    expect(result.outcome).toBe("unverifiable")
    expect(result.provenance).toBe(EVIDENCE_PROVENANCE.NONE)
    expect(result.outcome).not.toBe("pass")
    expect(result.outcome).not.toBe("fail")
  })

  test("an evidence file with no notepad is unverifiable but visibly weaker", () => {
    //#given only a convention-only evidence file (no program wrote it)
    const input = { itemId: "dod-3", notepad: null, evidenceFiles: ["t6-fence-red.txt"] }

    //#when the item is resolved
    const result = resolveDoDEvidence(input)

    //#then presence alone is not proof, so it stays unverifiable
    expect(result.outcome).toBe("unverifiable")
    expect(result.provenance).toBe(EVIDENCE_PROVENANCE.CONVENTION_FILE)
  })

  test("an incomplete notepad with a file is still unverifiable", () => {
    //#given a notepad that exists but carries no Completion stamp
    const input = { itemId: "dod-4", notepad: { taskId: "T-x", completed: false }, evidenceFiles: ["a.txt"] }

    //#when the item is resolved
    const result = resolveDoDEvidence(input)

    //#then only file presence backs it, so no confidence is manufactured
    expect(result.outcome).toBe("unverifiable")
    expect(result.provenance).toBe(EVIDENCE_PROVENANCE.CONVENTION_FILE)
  })

  test("the three provenance classes are distinct strings", () => {
    //#given the exported provenance table
    //#when the labels are read
    //#then each is human-readable and distinct
    expect(new Set(Object.values(EVIDENCE_PROVENANCE)).size).toBe(3)
    expect(EVIDENCE_PROVENANCE.NOTEPAD).toBe("notepad (machine-written)")
    expect(EVIDENCE_PROVENANCE.CONVENTION_FILE).toBe("file presence only (convention)")
    expect(EVIDENCE_PROVENANCE.NONE).toBe("none")
  })
})

describe("capture helper", () => {
  test("builds a bash-invocable command line that names the command", () => {
    //#given a plan, task, slug and the command to record
    const input = { plan: "plan-completion-review", task: "task-8", slug: "unverifiable", command: "bun test" }

    //#when the capture command is built
    const cmd = buildCaptureCommand(input)

    //#then it is a shell line targeting .matrixx/evidence and recording all three fields
    expect(cmd).toContain(".matrixx/evidence/plan-completion-review/task-8-unverifiable.txt")
    expect(cmd).toContain("command: ")
    expect(cmd).toContain("exit: ")
    expect(cmd).toContain("output_bytes: ")
  })

  test("round-trips a record through parse so command, exit and size survive", () => {
    //#given a record line as the capture helper writes it
    const line = 'command: bun run typecheck\nexit: 0\noutput_bytes: 0\n'

    //#when it is parsed back
    const record = parseCaptureRecord(line)

    //#then all three fields are recovered
    expect(record).toEqual({ command: "bun run typecheck", exitCode: 0, outputBytes: 0 })
  })

  test("shell-quotes a command containing single quotes and evaluates it", () => {
    //#given a command whose argument contains single quotes
    const cmd = buildCaptureCommand({ plan: "p", task: "t", slug: "s", command: "printf 'a b'" })

    //#when the quoting is inspected
    //#then the quote is escaped and the command is eval'd, not passed as one literal word
    expect(cmd).toContain(`'\\''`)
    expect(cmd).toContain("eval ")
  })

  test("uses rc, not status, which is read-only in zsh", () => {
    //#given any capture command
    const cmd = buildCaptureCommand({ plan: "p", task: "t", slug: "s", command: "true" })

    //#when the exit variable is inspected
    //#then it is a name zsh accepts as writable
    expect(cmd).toContain("rc=$?")
    expect(cmd).not.toContain("status=$?")
  })

  test("returns null for a file that carries no record header", () => {
    //#given convention-only bytes with no header
    //#when they are parsed
    const record = parseCaptureRecord("bun test v1.4.0\n 3 pass\n 0 fail\n")

    //#then there is no record to claim
    expect(record).toBeNull()
  })
})
