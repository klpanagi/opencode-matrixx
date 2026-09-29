/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { findAppendixStart, findNamedRegion } from "../../../src/features/plan-contract/appendix"
import type { NamedRegion } from "../../../src/features/plan-contract/region"
import { resolveSectionSelector } from "../../../src/features/plan-contract/section-registry"

const PLAN_WITH_NESTED_H3 = [
  "# Plan",
  "",
  "## TL;DR",
  "",
  "text",
  "",
  "## Notes",
  "",
  "### Deep",
  "",
  "deep text",
  "",
  "## Appendix",
  "",
  "notes",
].join("\n")

describe("findNamedRegion", () => {
  test("returns inclusive start and exclusive end for a level-2 region", () => {
    //#given a plan whose H2 "Notes" is followed by an H3 and then a new H2
    const content = PLAN_WITH_NESTED_H3

    //#when the region named by the exact heading "Notes" is looked up
    const region = findNamedRegion(content, (heading) => heading.text === "Notes")

    //#then startIndex is the 1-based heading line and endIndex excludes the closing H2
    expect(region).not.toBeNull()
    expect(region?.startIndex).toBe(7)
    expect(region?.endIndex).toBe(13)
  })

  test("treats a nested H3 as inside its parent H2, not as a boundary", () => {
    //#given the same plan
    const content = PLAN_WITH_NESTED_H3

    //#when the H3 region is looked up
    const region = findNamedRegion(content, (heading) => heading.text === "Deep")

    //#then the H3 closes at the next H2, and the parent H2 does not close at the H3
    expect(region?.startIndex).toBe(9)
    expect(region?.endIndex).toBe(13)
  })

  test("closes a trailing region at lines.length + 1", () => {
    //#given a plan ending with the region
    const content = PLAN_WITH_NESTED_H3

    //#when the last region is looked up
    const region = findNamedRegion(content, (heading) => heading.text === "Appendix")

    //#then endIndex is the exclusive sentinel one past the final line
    expect(region?.endIndex).toBe(PLAN_WITH_NESTED_H3.split("\n").length + 1)
  })

  test("returns null when no heading satisfies the predicate", () => {
    //#given a plan with no such heading
    const content = PLAN_WITH_NESTED_H3

    //#when an absent name is looked up
    const region = findNamedRegion(content, (heading) => heading.text === "Nonexistent")

    //#then the result is null rather than a fabricated region
    expect(region).toBeNull()
  })

  test("exposes the heading level to the predicate", () => {
    //#given a plan with both an H2 and an H3 of the same text
    const content = "## Dup\n\n## Sec\n\n### Dup\n"

    //#when only the H3 is selected
    const region = findNamedRegion(content, (heading) => heading.text === "Dup" && heading.level === 3)

    //#then the H3 line is the one reported
    expect(region?.startIndex).toBe(5)
  })

  test("an Appendix-prefixed heading is reachable by prefix without changing the exact-match result", () => {
    //#given a corpus-realistic heading
    const content = "## TL;DR\n\n## Appendix: Extra Notes\n\ntext\n"

    //#when matched by the shared prefix rule
    const region = findNamedRegion(content, (heading) => heading.text.startsWith("Appendix"))

    //#then the region is found at its own line
    expect(region?.startIndex).toBe(3)
  })
})

describe("findAppendixStart back-compat", () => {
  test("returns the same zero-based index the exact-match implementation returned", () => {
    //#given a plan with an exact "## Appendix" H2
    const content = PLAN_WITH_NESTED_H3

    //#when the legacy accessor is used
    const index = findAppendixStart(content)

    //#then it is the 0-based line index, unchanged
    expect(index).toBe(12)
    expect(content.split("\n")[index]).toBe("## Appendix")
  })

  test("still returns -1 for a prefix-only appendix heading", () => {
    //#given a corpus-realistic "## Appendix: Extra Notes" heading
    const content = "## TL;DR\n\n## Appendix: Extra Notes\n\ntext\n"

    //#when the legacy accessor is used
    const index = findAppendixStart(content)

    //#then it is -1, exactly as before the generalization
    expect(index).toBe(-1)
  })

  test("returns -1 when the plan has no appendix", () => {
    //#given a plan with no appendix
    const content = "## TL;DR\n\ntext\n"

    //#when the legacy accessor is used
    const index = findAppendixStart(content)

    //#then it is -1
    expect(index).toBe(-1)
  })

  test("returns -1 when an H3 named Appendix exists but no H2 does", () => {
    //#given an H3-only appendix
    const content = "## TL;DR\n\n### Appendix\n\ntext\n"

    //#when the legacy accessor is used
    const index = findAppendixStart(content)

    //#then it stays -1, preserving the H2-only rule
    expect(index).toBe(-1)
  })
})

describe("corpus Appendix prefix through the registry", () => {
  test("resolves an Appendix-prefixed heading as custom, never as an error", () => {
    //#given a corpus-realistic heading line
    const selector = "## Appendix: Extra Notes"

    //#when it is resolved through the section registry
    const resolution = resolveSectionSelector(selector)

    //#then it is the custom escape hatch and carries no message
    expect(resolution.kind).toBe("custom")
    expect("message" in resolution).toBe(false)
  })
})

describe("region type", () => {
  test("exposes inclusive start and exclusive end", () => {
    //#given a region literal typed by the exported interface
    const region: NamedRegion = { level: 2, text: "X", startIndex: 1, endIndex: 2 }

    //#then the convention fields are present
    expect(region.endIndex).toBeGreaterThan(region.startIndex)
  })
})
