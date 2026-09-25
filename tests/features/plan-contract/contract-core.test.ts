/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import {
  CANONICAL_SECTIONS,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  PlanContractSchema,
  REQUIRED_TASK_SUBFIELDS,
} from "../../../src/features/plan-contract"

describe("plan-contract core", () => {
  test("exposes the 8 canonical H2 sections in order", () => {
    //#given the canonical Oracle plan structure
    const expected = [
      "TL;DR",
      "Context",
      "Work Objectives",
      "Verification Strategy (MANDATORY)",
      "Execution Strategy",
      "TODOs",
      "Commit Strategy",
      "Success Criteria",
    ]

    //#when reading CANONICAL_SECTIONS
    const sections = CANONICAL_SECTIONS

    //#then it matches the expected order exactly
    expect(sections).toHaveLength(8)
    expect([...sections]).toEqual(expected)
    expect(sections[0]).toBe("TL;DR")
    expect(sections[7]).toBe("Success Criteria")
  })

  test("lists the 7 required task subfields in order", () => {
    //#given the required Oracle task grammar
    const expected = [
      "What to do",
      "Must NOT do",
      "Recommended Agent Profile",
      "Parallelization",
      "References",
      "Acceptance Criteria",
      "Agent-Executed QA Scenarios",
    ]

    //#when reading REQUIRED_TASK_SUBFIELDS
    const subfields = REQUIRED_TASK_SUBFIELDS

    //#then it matches exactly
    expect(subfields).toHaveLength(7)
    expect([...subfields]).toEqual(expected)
  })

  test("re-exports the mission-state task-line regexes without re-declaring them", () => {
    //#given numbered Oracle task lines
    const content = "- [ ] 1. Implement thing\n- [x] 2. Verify thing"

    //#when applying the re-exported regexes
    const unchecked = content.match(NUMBERED_UNCHECKED_RE) ?? []
    const checked = content.match(NUMBERED_CHECKED_RE) ?? []

    //#then they behave like the SSOT patterns
    expect(unchecked).toHaveLength(1)
    expect(checked).toHaveLength(1)
  })

  test("parses a valid structured plan view", () => {
    //#given a complete structured view
    const view = {
      sections: ["TL;DR", "TODOs"],
      tasks: [{ n: 1, title: "Implement thing", checked: false, line: 28, anchor: "L28" }],
      dod: ["bun test passes"],
    }

    //#when parsing with PlanContractSchema
    const result = PlanContractSchema.safeParse(view)

    //#then parsing succeeds and preserves the tasks
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tasks).toHaveLength(1)
      expect(result.data.tasks[0]?.title).toBe("Implement thing")
    }
  })

  test("accepts an optional frontMatter block", () => {
    //#given a view carrying front-matter
    const view = {
      frontMatter: { status: "pending", revision: 1, deps: [], blockedBy: [] },
      sections: ["TL;DR"],
      tasks: [],
      dod: [],
    }

    //#when parsing
    const result = PlanContractSchema.safeParse(view)

    //#then it is accepted
    expect(result.success).toBe(true)
  })

  test("rejects a structured view missing tasks", () => {
    //#given a view with no tasks field
    const view = { sections: [], dod: [] }

    //#when parsing
    const result = PlanContractSchema.safeParse(view)

    //#then it fails validation
    expect(result.success).toBe(false)
  })
})
