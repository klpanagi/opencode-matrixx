/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { readFileSync, statSync } from "node:fs"
import { buildOutline, buildSectionIndex, readSectionSpan } from "../../../src/tools/plan/section-index"

const STORAGE = ".test-section-index"

const PLAN = [
  "# Plan Title",
  "",
  "Some preamble prose before any section.",
  "",
  "## TL;DR",
  "One line summary.",
  "",
  "### Agent-Executed QA Scenarios",
  "Run the byte reconciliation scenario.",
  "",
  "## TODOs",
  "",
  "- [ ] 1. First numbered task",
  "  indented detail line",
  "- [x] 2. Second numbered task",
  "",
  "## Commit Strategy",
  "- [ ] 1. A repeated task line",
  "  trailing detail",
  "",
].join("\n")

function writeFixture(content: string): string {
  const dir = join(process.cwd(), STORAGE)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "sample-plan.md")
  writeFileSync(path, content, "utf8")
  return path
}

function cleanup(): void {
  rmSync(join(process.cwd(), STORAGE), { recursive: true, force: true })
}

describe("buildSectionIndex", () => {
  test("emits id, level, headingText, startLine, endLine, bytes and contentHash per section", () => {
    //#given a plan with H2 sections and one H3 subsection
    const content = PLAN

    //#when the index is built
    const index = buildSectionIndex(content)

    //#then every entry carries the full section shape
    expect(index.length).toBeGreaterThan(0)
    for (const entry of index) {
      expect(Object.keys(entry).sort()).toEqual([
        "bytes",
        "contentHash",
        "endLine",
        "headingText",
        "id",
        "level",
        "startLine",
      ])
      expect([2, 3]).toContain(entry.level)
      expect(typeof entry.headingText).toBe("string")
      expect(entry.id.length).toBeGreaterThan(0)
      expect(entry.startLine).toBeGreaterThanOrEqual(1)
      expect(entry.endLine).toBeGreaterThan(entry.startLine)
      expect(entry.bytes).toBeGreaterThan(0)
      expect(entry.contentHash.length).toBeGreaterThanOrEqual(16)
    }
    //#then H2 and H3 are both indexed, ids are kebab-case
    expect(index.map((e) => e.id)).toEqual([
      "tl-dr",
      "agent-executed-qa-scenarios",
      "todos",
      "commit-strategy",
    ])
    expect(index.map((e) => e.level)).toEqual([2, 3, 2, 2])
  })

  test("endLine is EXCLUSIVE: [startLine, endLine) yields exactly the section and nothing after", () => {
    //#given the same plan
    const content = PLAN
    const lines = content.split("\n")

    //#when the index is built and each section span is read
    const index = buildSectionIndex(content)
    const todos = index.find((e) => e.id === "todos")
    const commit = index.find((e) => e.id === "commit-strategy")

    //#then TODOs ends exactly where Commit Strategy starts
    expect(todos).toBeDefined()
    expect(commit).toBeDefined()
    expect(todos?.endLine).toBe(commit?.startLine)
    //#then the span never bleeds into the next section
    const span = readSectionSpan(lines, todos!)
    expect(span).toContain("## TODOs")
    expect(span).toContain("Second numbered task")
    expect(span).not.toContain("## Commit Strategy")
    expect(span).not.toContain("A repeated task line")
    //#then the span is the exact original slice, newline-inclusive, and stops
    // one line short of the next heading
    expect(span).toBe(lines.slice(todos!.startLine - 1, todos!.endLine - 1).join("\n") + "\n")
    expect(lines[todos!.endLine - 1]).toBe("## Commit Strategy")
  })

  test("an H3 section ends at the next H2, not at EOF", () => {
    //#given a plan whose H3 is followed by an H2
    const lines = PLAN.split("\n")

    //#when the index is built
    const index = buildSectionIndex(PLAN)
    const h3 = index.find((e) => e.level === 3)
    const todos = index.find((e) => e.id === "todos")

    //#then the H3 span stops at the H2 boundary
    expect(h3?.endLine).toBe(todos?.startLine)
    expect(readSectionSpan(lines, h3!)).toContain("byte reconciliation scenario")
    expect(readSectionSpan(lines, h3!)).not.toContain("## TODOs")
  })

  test("bytes equals the UTF-8 byte length of the section's exact original text span", () => {
    //#given a plan containing multi-byte characters
    const content = PLAN.replace("One line summary.", "Σύνοψη — one line ✅ summary.")
    const lines = content.split("\n")

    //#when the index is built
    const index = buildSectionIndex(content)

    //#then each section's bytes match the ruler applied to its own span
    for (const entry of index) {
      const span = readSectionSpan(lines, entry)
      expect(entry.bytes).toBe(Buffer.byteLength(span, "utf8"))
      //#then and differ from a UTF-16 count, proving a real byte ruler was used
      if (span.includes("Σύνοψη")) expect(entry.bytes).not.toBe(span.length)
    }
  })

  test("section bytes reconcile with stat.size minus front matter within tolerance 0", () => {
    //#given a real file on disk with a preamble (front matter) before the first section
    cleanup()
    const path = writeFixture(PLAN)

    //#when the index is built from the file's own bytes
    const content = readFileSync(path, "utf8")
    const stat = statSync(path)
    const index = buildSectionIndex(content)
    const lines = content.split("\n")
    const firstStart = index[0]?.startLine ?? 1
    const preamble = lines.slice(0, firstStart - 1).join("\n")
    const preambleBytes = preamble === "" ? 0 : Buffer.byteLength(preamble, "utf8") + 1
    // An H3 nests inside its parent H2, so nested bytes legitimately overlap.
    // Reconciliation must sum TOP-LEVEL sections only.
    const sectionBytes = index
      .filter((entry) => entry.level === 2)
      .reduce((sum, entry) => sum + entry.bytes, 0)

    //#then sum(top-level sections) + preamble === stat.size, tolerance 0
    // (tolerance 0 is honest: spans are byte-exact original slices — no lossy
    //  AST re-serialization, no line-ending translation, no rounding)
    expect(sectionBytes + preambleBytes).toBe(stat.size)
    expect(Math.abs(sectionBytes + preambleBytes - stat.size)).toBeLessThanOrEqual(0)
    cleanup()
  })
})
