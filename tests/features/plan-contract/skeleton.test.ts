/// <reference types="bun-types" />
import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"
import { ORACLE_PLAN_TEMPLATE } from "../../../src/agents/oracle/plan-template"
import {
  CANONICAL_SECTIONS,
  renderPlanSkeleton,
  REQUIRED_TASK_SUBFIELDS,
  validatePlanContract,
} from "../../../src/features/plan-contract"
import {
  type SectionResolution,
  resolveSectionSelector,
} from "../../../src/features/plan-contract/section-registry"

/** Heading lines the skeleton renders OUTSIDE fenced code blocks, in order. */
function skeletonHeadings(skeleton: string): string[] {
  const headings: string[] = []
  let inFence = false
  for (const line of skeleton.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/^#{2,3}\s/.test(line)) headings.push(line)
  }
  return headings
}

/** The two skeleton H3s Plan A deliberately left out of the registry. */
const SKELETON_CUSTOM_H3 = [
  "### If TDD Enabled",
  "### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)",
]

function resolutionOf(heading: string): SectionResolution {
  return resolveSectionSelector(heading)
}

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

describe("skeleton ↔ section-registry consistency guard", () => {
  test("every H2 the skeleton emits resolves to its canonical registry id", () => {
    //#given the rendered skeleton
    const skeleton = renderPlanSkeleton()

    //#when each H2 line is resolved against the section registry
    const h2 = skeletonHeadings(skeleton).filter((line) => line.startsWith("## "))

    //#then all 8 resolve to the derived id of their canonical heading, in order
    expect(h2).toEqual(CANONICAL_SECTIONS.map((section) => `## ${section}`))
    const resolutions = h2.map((line) => resolutionOf(line))
    for (const resolution of resolutions) expect(resolution.kind).toBe("resolved")
    expect(resolutions.map((r) => (r.kind === "resolved" ? r.entry.id : null))).toEqual([
      "tl-dr",
      "context",
      "work-objectives",
      "verification-strategy",
      "execution-strategy",
      "todos",
      "commit-strategy",
      "success-criteria",
    ])
  })

  test("the skeleton emits exactly 16 distinct H3s: 14 registry ids + 2 custom", () => {
    //#given the rendered skeleton
    const skeleton = renderPlanSkeleton()

    //#when the non-fenced H3 lines are collected
    const h3 = [...new Set(skeletonHeadings(skeleton).filter((l) => l.startsWith("### ")))]

    //#then the count is asserted, not assumed
    expect(h3).toHaveLength(16)

    //#and 14 of them resolve to a registry id
    expect(h3.filter((line) => resolutionOf(line).kind === "resolved")).toHaveLength(14)

    //#and the remaining 2 are the documented escape-hatch headings
    const custom = h3.filter((line) => resolutionOf(line).kind === "custom")
    expect(custom).toEqual(SKELETON_CUSTOM_H3)
  })

  test("the 2 escape-hatch H3s resolve to kind:custom, never ambiguous and never resolved", () => {
    //#given the two deliberately-unregistered skeleton headings
    //#when each is resolved
    const kinds = SKELETON_CUSTOM_H3.map((line) => resolutionOf(line))

    //#then both are custom (the escape hatch PASSES — it is not a warning)
    for (const resolution of kinds) expect(resolution.kind).toBe("custom")

    //#and each custom resolution carries a derived id but no `message` key
    expect(
      kinds.map((resolution) => (resolution.kind === "custom" ? resolution.id : null))
    ).toEqual(["if-tdd-enabled", "agent-executed-qa-scenarios-mandatory-all-tasks"])
    for (const resolution of kinds) expect("message" in resolution).toBe(false)
  })

  test("the parenthesised-suffix H3 keeps its suffix after normalization", () => {
    //#given the parenthesised H3 the skeleton emits at skeleton.ts:21
    const heading = "### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)"

    //#when resolved
    const resolution = resolutionOf(heading)

    //#then it does NOT collapse onto the bare `agent-executed-qa-scenarios` id
    expect(resolution.kind).toBe("custom")
    if (resolution.kind !== "custom") throw new Error("expected custom resolution")
    expect(resolution.id).not.toBe("agent-executed-qa-scenarios")
  })

  test("no heading the skeleton emits is ambiguous (the only real defect)", () => {
    //#given every heading the skeleton renders
    const headings = skeletonHeadings(renderPlanSkeleton())

    //#when each is resolved
    const offenders = headings
      .map((line) => resolutionOf(line))
      .filter((resolution) => resolution.kind === "ambiguous")

    //#then multi-match is absent. `custom` is a legitimate escape hatch, not a
    //#failure — the guard is NOT a demand that every heading be registered.
    expect(offenders.map((r) => (r.kind === "ambiguous" ? r.message : ""))).toEqual([])
    expect(headings).toHaveLength(24)
  })

  test("renderPlanSkeleton output is byte-identical to its post-slimming snapshot", () => {
    //#given the slimmed skeleton bytes (QA guidance externalized to docs/plan-qa-scenarios.md)
    const expectedSha = "6fac99533851302d386db7403fba0d93226f30532f3a2705cd6e510a54f3a0d2"

    //#when the skeleton is rendered now
    const skeleton = renderPlanSkeleton()

    //#then the digest is unchanged — this task added a guard, not a template edit
    expect(createHash("sha256").update(skeleton).digest("hex")).toBe(expectedSha)
    expect(skeleton).toHaveLength(11645)
  })

  test("the guard is load-bearing: a near-miss heading does not resolve to the registry", () => {
    //#given a heading that differs from the canonical one only by an extra
    //#parenthesised suffix — the same shape as the real `If TDD Enabled` case
    const nearMiss = "### Verification Strategy (MANDATORY — ALL tasks)"

    //#when it is resolved
    const resolution = resolutionOf(nearMiss)

    //#then it is NOT silently accepted as the canonical `verification-strategy` id,
    //#so a drifting skeleton heading can never be mistaken for a registered one
    expect(resolution.kind).not.toBe("resolved")
    expect(resolution.kind === "resolved" ? resolution.entry.id : resolution.kind).not.toBe(
      "verification-strategy"
    )
  })
})
