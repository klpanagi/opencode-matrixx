/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { MAX_PLAN_FILE_BYTES } from "../../../src/features/mission-state/constants"
import {
  findAppendixStart,
  parsePlanContract,
  parsePlanTasks,
  validatePlanContract,
} from "../../../src/features/plan-contract"

const FIXTURE = readFileSync(
  new URL("../../fixtures/plan-contract/conformant-plan.md", import.meta.url),
  "utf8",
)

describe("parsePlanTasks", () => {
  test("parses a numbered unchecked task with title, line and anchor", () => {
    //#given a plan with a single numbered task
    const content = "# Plan\n\n- [ ] 1. Implement the feature\n"

    //#when parsing the task lines
    const tasks = parsePlanTasks(content)

    //#then the task metadata is extracted
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.n).toBe(1)
    expect(tasks[0]?.title).toBe("Implement the feature")
    expect(tasks[0]?.checked).toBe(false)
    expect(tasks[0]?.line).toBe(3)
    expect(tasks[0]?.anchor).toMatch(/^\d+#\w+$/)
    expect(tasks[0]?.anchor.startsWith("3#")).toBe(true)
  })

  test("marks a checked numbered task as completed", () => {
    //#given a checked numbered task
    const content = "- [x] 2. Already done\n"

    //#when parsing
    const tasks = parsePlanTasks(content)

    //#then it is reported as checked
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.n).toBe(2)
    expect(tasks[0]?.checked).toBe(true)
    expect(tasks[0]?.title).toBe("Already done")
  })

  test("prefers caller-supplied hashline anchors over computed ones", () => {
    //#given a task line and an explicit anchor map
    const content = "- [ ] 1. Anchored task\n"
    const anchors = new Map<number, string>([[1, "1#ZZ"]])

    //#when parsing with the anchor map
    const tasks = parsePlanTasks(content, anchors)

    //#then the supplied anchor is used verbatim
    expect(tasks[0]?.anchor).toBe("1#ZZ")
  })

  test("ignores unnumbered checkboxes", () => {
    //#given only unnumbered boxes
    const content = "- [ ] Not a numbered task\n- [x] Also not numbered\n"

    //#when parsing
    const tasks = parsePlanTasks(content)

    //#then no tasks are reported
    expect(tasks).toHaveLength(0)
  })
})

describe("parsePlanContract", () => {
  test("returns sections, tasks and definition-of-done lines from the fixture", () => {
    //#given the conformant fixture
    //#when building the structured view
    const contract = parsePlanContract(FIXTURE)

    //#then the canonical sections and the single task are present
    expect(contract.sections).toContain("TODOs")
    expect(contract.sections).toContain("Success Criteria")
    expect(contract.sections).toHaveLength(8)
    expect(contract.tasks).toHaveLength(1)
    expect(contract.tasks[0]?.title).toBe("Implement the feature")
    expect(contract.dod).toEqual(["Feature implemented", "Tests pass"])
  })

  test("returns empty dod when no Definition of Done heading exists", () => {
    //#given content without a definition-of-done block
    const content = "## TL;DR\n\nNothing here.\n"

    //#when parsing
    const contract = parsePlanContract(content)

    //#then dod is empty rather than undefined
    expect(contract.dod).toEqual([])
  })
})

describe("findAppendixStart", () => {
  test("returns the zero-based index of the first Appendix H2", () => {
    //#given content with an appendix
    const content = "## TL;DR\n\ntext\n\n## Appendix\n\nnotes\n"

    //#when locating the appendix
    const index = findAppendixStart(content)

    //#then the zero-based line index is returned
    expect(index).toBe(4)
    expect(content.split("\n")[index]).toBe("## Appendix")
  })

  test("returns -1 when there is no appendix", () => {
    //#given content without an appendix
    const content = "## TL;DR\n\ntext\n"

    //#when locating the appendix
    const index = findAppendixStart(content)

    //#then it signals absence
    expect(index).toBe(-1)
  })
})

describe("validatePlanContract", () => {
  test("produces zero warnings and ok=true for the conformant fixture", () => {
    //#given the conformant fixture
    //#when validating in the default warn mode
    const result = validatePlanContract(FIXTURE)

    //#then there is no drift
    expect(result.warnings).toEqual([])
    expect(result.ok).toBe(true)
  })

  test("warns about a missing canonical section without failing in warn mode", () => {
    //#given content missing the Work Objectives section
    const content = FIXTURE.replace("## Work Objectives\n", "")

    //#when validating in warn mode
    const result = validatePlanContract(content)

    //#then missing_section is reported but ok stays true
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => w.code === "missing_section")).toBe(true)
  })

  test("tolerates Verification Strategy without the (MANDATORY) suffix", () => {
    //#given the fixture with the suffix stripped
    const content = FIXTURE.replace("## Verification Strategy (MANDATORY)", "## Verification Strategy")

    //#when validating
    const result = validatePlanContract(content)

    //#then the section is recognized and nothing warns
    expect(result.warnings).toEqual([])
    expect(result.ok).toBe(true)
  })

  test("flags a plan whose only checkboxes are unnumbered", () => {
    //#given content with only unnumbered boxes
    const content = "## TL;DR\n\n- [ ] a loose box\n- [ ] another loose box\n"

    //#when validating
    const result = validatePlanContract(content)

    //#then no_numbered_tasks is reported
    expect(result.warnings.some((w) => w.code === "no_numbered_tasks")).toBe(true)
  })

  test("reports a missing bold subfield on a numbered task", () => {
    //#given the fixture with the Must NOT do label removed
    const content = FIXTURE.replace("  **Must NOT do**:\n", "")

    //#when validating
    const result = validatePlanContract(content)

    //#then missing_subfield names the task number and the label
    const warning = result.warnings.find((w) => w.code === "missing_subfield")
    expect(warning).toBeDefined()
    expect(warning?.message).toContain("Must NOT do")
    expect(warning?.message).toContain("1")
  })

  test("matches bold subfields written with a trailing parenthetical", () => {
    //#given a task carrying every subfield in a tolerated spelling
    const content = FIXTURE.replace(
      "  **What to do**:",
      "  **What to do (always)**",
    ).replace("  **Parallelization**:", "  **Parallelization** (wave info):")

    //#when validating
    const result = validatePlanContract(content)

    //#then no subfield is reported missing
    expect(result.warnings.some((w) => w.code === "missing_subfield")).toBe(false)
  })

  test("flags a non-canonical top-level section", () => {
    //#given the fixture with an extra non-canonical H2
    const content = `${FIXTURE}\n## Rollback Notes\n\nSome notes.\n`

    //#when validating
    const result = validatePlanContract(content)

    //#then unknown_top_level_section is reported
    expect(result.warnings.some((w) => w.code === "unknown_top_level_section")).toBe(true)
  })

  test("exempts H2s at or after the Appendix boundary", () => {
    //#given the fixture followed by an appendix containing a non-canonical H2
    const content = `${FIXTURE}\n## Appendix\n\n## Internal Notes\n\nMore detail.\n`

    //#when validating
    const result = validatePlanContract(content)

    //#then the appendix region is not flagged and the fixture stays clean
    expect(result.warnings.some((w) => w.code === "unknown_top_level_section")).toBe(false)
    expect(result.warnings).toEqual([])
  })

  test("flags canonical sections that are out of order", () => {
    //#given content with Success Criteria before TL;DR
    const content = "## Success Criteria\n\n## TL;DR\n\n- [ ] 1. T\n"

    //#when validating
    const result = validatePlanContract(content)

    //#then section_out_of_order is reported
    expect(result.warnings.some((w) => w.code === "section_out_of_order")).toBe(true)
  })

  test("advises when content approaches the plan size cap", () => {
    //#given content just above 90% of the byte cap
    const padding = "x".repeat(Math.ceil(MAX_PLAN_FILE_BYTES * 0.91))
    const content = `## TL;DR\n\n- [ ] 1. T\n\n${padding}\n`

    //#when validating
    const result = validatePlanContract(content)

    //#then approaching_size_cap is reported as advisory
    expect(result.warnings.some((w) => w.code === "approaching_size_cap")).toBe(true)
    expect(result.ok).toBe(true)
  })

  test("promotes warnings to errors in fail mode", () => {
    //#given content missing a canonical section
    const content = "## TL;DR\n\n- [ ] 1. T\n"

    //#when validating in warn mode and in fail mode
    const warned = validatePlanContract(content)
    const failed = validatePlanContract(content, { mode: "fail" })

    //#then warn mode stays ok and fail mode hard-fails
    expect(warned.ok).toBe(true)
    expect(warned.warnings.length).toBeGreaterThan(0)
    expect(failed.ok).toBe(false)
    expect(failed.errors.length).toBeGreaterThan(0)
    expect(failed.warnings).toEqual([])
  })

  test("reports an error for empty content", () => {
    //#given blank content
    const content = "   \n\n"

    //#when validating
    const result = validatePlanContract(content)

    //#then an error is produced and ok is false
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
