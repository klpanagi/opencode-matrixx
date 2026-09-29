/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"

const PLAN = [
  "# Plan Title",
  "",
  "Some preamble prose before any section.",
  "",
  "## TL;DR",
  "One line summary.",
  "",
  "## TODOs",
  "",
  "- [ ] 1. First numbered task",
  "  indented detail line",
  "",
  "## Commit Strategy",
  "- [ ] 1. A repeated task line",
  "  trailing detail",
  "",
].join("\n")

describe("section contentHash", () => {
  test("is at least 64 bits wide", () => {
    //#given an indexed plan
    const index = buildSectionIndex(PLAN)

    //#then the hex encoding carries 16 hex digits (64 bits)
    expect(index.length).toBeGreaterThan(0)
    for (const entry of index) {
      expect(entry.contentHash).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  test("identical section text at different positions hashes differently", () => {
    //#given three sections whose bodies are byte-identical
    const repeated = ["## A", "same body", "", "## B", "same body", "", "## C", "same body", ""].join("\n")

    //#when the index is built
    const index = buildSectionIndex(repeated)

    //#then all three hashes are distinct
    expect(index.length).toBe(3)
    expect(new Set(index.map((entry) => entry.contentHash)).size).toBe(3)
  })

  test("identical bodies at the SAME position hash equally when id and position match", () => {
    //#given one section
    const single = ["## Only", "body", ""].join("\n")

    //#when indexed twice
    const first = buildSectionIndex(single)
    const second = buildSectionIndex(single)

    //#then the hash is stable for unchanged content
    expect(first[0]?.contentHash).toBe(second[0]?.contentHash)
  })

  test("editing section A changes hash(A) and leaves hash(B) byte-identical", () => {
    //#given an indexed three-section plan
    const before = buildSectionIndex(PLAN)
    const hashA = before.find((entry) => entry.id === "tl-dr")?.contentHash
    const hashB = before.find((entry) => entry.id === "commit-strategy")?.contentHash
    expect(hashA).toBeDefined()
    expect(hashB).toBeDefined()

    //#when only section A's text changes (same line count, so B's startLine is stable)
    const edited = PLAN.replace("One line summary.", "Two line summary edited.")
    const after = buildSectionIndex(edited)
    const nextA = after.find((entry) => entry.id === "tl-dr")?.contentHash
    const nextB = after.find((entry) => entry.id === "commit-strategy")?.contentHash

    //#then hash(A) changed and hash(B) is byte-identical
    expect(nextA).not.toBe(hashA)
    expect(nextB).toBe(hashB)
  })

  test("moving a section changes its hash because startLine is part of the input", () => {
    //#given a plan where the same section appears at two positions
    const moved = ["## A", "body", "", "## Pad", "filler", "", "## B", "body", ""].join("\n")

    //#when indexed
    const index = buildSectionIndex(moved)
    const a = index.find((entry) => entry.id === "a")
    const b = index.find((entry) => entry.id === "b")

    //#then a content-only hash would collide but the position-sensitive one does not
    expect(a?.headingText).toBe("A")
    expect(b?.headingText).toBe("B")
    expect(readSectionText(moved, a!)).not.toBe(readSectionText(moved, b!))
    expect(a?.contentHash).not.toBe(b?.contentHash)
  })
})

function readSectionText(content: string, entry: { startLine: number; endLine: number }): string {
  const lines = content.split("\n")
  return lines.slice(entry.startLine - 1, entry.endLine - 1).join("\n")
}
