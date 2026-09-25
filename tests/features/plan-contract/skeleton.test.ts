/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { ORACLE_PLAN_TEMPLATE } from "../../../src/agents/oracle/plan-template"
import {
  CANONICAL_SECTIONS,
  renderPlanSkeleton,
  REQUIRED_TASK_SUBFIELDS,
  validatePlanContract,
} from "../../../src/features/plan-contract"

describe("renderPlanSkeleton", () => {
  test("emits every canonical section as an `## <section>` heading", () => {
    //#given the canonical section list
    //#when rendering the skeleton
    const skeleton = renderPlanSkeleton()

    //#then every canonical section appears as an H2
    for (const section of CANONICAL_SECTIONS) {
      expect(skeleton).toContain(`## ${section}`)
    }
  })

  test("emits exactly the canonical H2 set (no extra H2 headings)", () => {
    //#given the canonical section list
    //#when rendering the skeleton
    const skeleton = renderPlanSkeleton()

    //#then the ordered H2 lines equal the canonical set
    const h2 = skeleton.split("\n").filter((line) => line.startsWith("## "))
    expect(h2).toEqual(CANONICAL_SECTIONS.map((section) => `## ${section}`))
  })

  test("emits each required task subfield in canonical `**<Label>**:` form", () => {
    //#given the required subfield list
    //#when rendering the skeleton
    const skeleton = renderPlanSkeleton()

    //#then each label appears with the canonical closing colon, no decoration
    for (const label of REQUIRED_TASK_SUBFIELDS) {
      expect(skeleton).toContain(`**${label}**:`)
    }
  })

  test("normalizes previously decorated labels (References / QA Scenarios)", () => {
    //#given the two labels that used to carry a trailing parenthetical
    const decorated = ["References", "Agent-Executed QA Scenarios"]
    //#when rendering the skeleton
    const skeleton = renderPlanSkeleton()

    //#then the canonical form is present and the old decoration is gone
    for (const label of decorated) {
      expect(skeleton).toContain(`**${label}**:`)
      expect(skeleton).not.toContain(`**${label}** (`)
      expect(skeleton).not.toContain(`**${label} (`)
    }
  })

  test("contains the `- [ ] 1.` numbered task grammar sample", () => {
    //#given the skeleton
    //#when rendered
    const skeleton = renderPlanSkeleton()

    //#then the numbered task grammar sample is present
    expect(skeleton).toContain("- [ ] 1.")
  })

  test("satisfies the plan contract with zero missing_section / missing_subfield", () => {
    //#given the generated skeleton
    //#when validating it against the live Task-2 matcher
    const result = validatePlanContract(renderPlanSkeleton())

    //#then no structural drift is reported
    expect(result.warnings.some((w) => w.code === "missing_section")).toBe(false)
    expect(result.warnings.some((w) => w.code === "missing_subfield")).toBe(false)
  })
})

describe("ORACLE_PLAN_TEMPLATE", () => {
  test("derives from renderPlanSkeleton and retains every canonical section", () => {
    //#given the generator
    //#when the assembled template is inspected
    const skeleton = renderPlanSkeleton()

    //#then it embeds the generated skeleton verbatim
    expect(ORACLE_PLAN_TEMPLATE).toContain(skeleton)
    for (const section of CANONICAL_SECTIONS) {
      expect(ORACLE_PLAN_TEMPLATE).toContain(`## ${section}`)
    }
  })

  test("retains every required task subfield in canonical form", () => {
    //#given the assembled template
    //#when inspecting subfield grammar
    //#then all required labels are canonical
    for (const label of REQUIRED_TASK_SUBFIELDS) {
      expect(ORACLE_PLAN_TEMPLATE).toContain(`**${label}**:`)
    }
  })
})
