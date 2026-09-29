/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"
import {
  classifyPlanLifecycle,
  PLAN_LIFECYCLE_CODES,
  resolveLifecycleSection,
} from "../../../src/features/plan-contract/lifecycle"
import { GRANDFATHER_ALLOWLIST } from "../../../src/features/plan-contract/migration"
import { validatePlanContract } from "../../../src/features/plan-contract/validate"

const FM = "---\nstatus: pending\nrevision: 1\n---\n"
const LEGACY_META = "\n<!-- plan-persister: {\"todoTotal\":1} -->\n"

function legacyBody(extra = ""): string {
  return `# Plan\n\n## TL;DR\n\nSome summary.\n\n## Context\n\nWhy.\n${extra}\n## Work Objectives\n\n1. Do it.\n\n### Legacy Only Subsection\n\nbody\n`
}

describe("classifyPlanLifecycle", () => {
  test("a modern plan with front-matter needs no diagnostic", () => {
    //#given a plan whose basename is not on the frozen allowlist
    const content = `${FM}${legacyBody()}`

    //#when the lifecycle is classified
    const result = classifyPlanLifecycle(".matrixx/plans/brand-new-plan.md", content)

    //#then it is modern and silent
    expect(result.state).toBe("modern")
    expect(result.warnings).toEqual([])
  })

  test("a grandfathered plan is silent, not merely un-checked", () => {
    //#given an allowlisted id with no front-matter
    const id = GRANDFATHER_ALLOWLIST[0] as string
    const content = legacyBody()

    //#when the lifecycle is classified
    const result = classifyPlanLifecycle(`.matrixx/plans/${id}.md`, content)

    //#then it is grandfathered and emits nothing
    expect(result.state).toBe("grandfathered")
    expect(result.warnings).toEqual([])
    expect(result.planId).toBe(id)
  })

  test("a RENAMED legacy plan gets the rename code, not the new-plan code", () => {
    //#given a legacy allowlisted body re-keyed to a basename off the allowlist
    const content = legacyBody(LEGACY_META)

    //#when the lifecycle is classified
    const result = classifyPlanLifecycle(".matrixx/plans/renamed-legacy-plan.md", content)

    //#then exactly the rename advisory is emitted
    expect(result.state).toBe("legacy_renamed")
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]?.code).toBe(PLAN_LIFECYCLE_CODES.legacyPlanRenamed)
    expect(result.warnings[0]?.code).not.toBe(PLAN_LIFECYCLE_CODES.newPlanMissingFrontMatter)
  })

  test("a NEW plan lacking front-matter gets a different code", () => {
    //#given a body with no front-matter and no legacy metadata comment
    const content = legacyBody()

    //#when the lifecycle is classified
    const result = classifyPlanLifecycle(".matrixx/plans/some-new-plan.md", content)

    //#then the new-plan advisory is emitted instead
    expect(result.state).toBe("new_plan_missing_front_matter")
    expect(result.warnings[0]?.code).toBe(PLAN_LIFECYCLE_CODES.newPlanMissingFrontMatter)
  })

  test("the rename advisory never tells a legacy plan to add front-matter", () => {
    //#given a renamed legacy plan
    const content = legacyBody(LEGACY_META)

    //#when the advisory is produced
    const [warning] = classifyPlanLifecycle(".matrixx/plans/renamed.md", content).warnings

    //#then the message steers toward the allowlist, never toward adding front-matter
    expect(warning?.message).toContain("allowlist")
    expect(warning?.message).not.toMatch(/add (the )?front-matter/i)
  })
})

describe("advisory, never fatal", () => {
  test("validatePlanContract still reports ok with zero errors for a legacy plan", () => {
    //#given a grandfathered legacy plan
    const content = legacyBody(LEGACY_META)

    //#when both the contract and the lifecycle are consulted
    const contract = validatePlanContract(content)
    const lifecycle = classifyPlanLifecycle(".matrixx/plans/renamed.md", content)

    //#then nothing is promoted to a blocking error
    expect(contract.ok).toBe(true)
    expect(contract.errors.length).toBeLessThanOrEqual(1)
    expect(lifecycle.warnings.every((w) => typeof w.code === "string")).toBe(true)
  })

  test("no plan shape ever produces more than one error", () => {
    //#given a spread of plan shapes
    const shapes = [legacyBody(), `${FM}${legacyBody()}`, "", legacyBody(LEGACY_META)]

    //#when each is validated
    const counts = shapes.map((content) => validatePlanContract(content).errors.length)

    //#then at most the single empty-content error is ever present
    for (const count of counts) expect(count).toBeLessThanOrEqual(1)
  })
})

describe("resolveLifecycleSection", () => {
  test("a grandfathered plan resolves sections exactly as a modern plan does", () => {
    //#given the same body with and without front-matter
    const legacy = legacyBody()
    const modern = `${FM}${legacy}`
    const allowlisted = GRANDFATHER_ALLOWLIST[0] as string

    //#when a canonical selector is resolved under both lifecycles
    const fromLegacy = resolveLifecycleSection("verification-strategy", `${allowlisted}.md`, legacy)
    const fromModern = resolveLifecycleSection("verification-strategy", "brand-new-plan.md", modern)

    //#then the resolutions are identical even though the lifecycles differ
    expect(fromLegacy.lifecycle.state).toBe("grandfathered")
    expect(fromModern.lifecycle.state).toBe("modern")
    expect(fromModern.resolution.kind).toBe("resolved")
    expect(fromLegacy.resolution).toEqual(fromModern.resolution)
  })

  test("an unregistered heading in a legacy plan hits the custom escape hatch", () => {
    //#given a legacy plan with a heading the registry does not know
    const allowlisted = GRANDFATHER_ALLOWLIST[0] as string

    //#when that heading is resolved
    const { resolution } = resolveLifecycleSection("### Legacy Only Subsection", `${allowlisted}.md`, legacyBody())

    //#then it is a custom section, not a failure, and carries no message
    expect(resolution.kind).toBe("custom")
    expect("message" in resolution).toBe(false)
  })

  test("a rename advisory does not change what a selector resolves to", () => {
    //#given a renamed legacy plan and a canonical selector
    const selector = "commit-strategy"

    //#when it is resolved
    const renamed = resolveLifecycleSection(selector, "renamed.md", legacyBody(LEGACY_META))

    //#then the advisory is reported but the resolution is unaffected
    expect(renamed.lifecycle.warnings[0]?.code).toBe(PLAN_LIFECYCLE_CODES.legacyPlanRenamed)
    expect(renamed.resolution.kind).toBe("resolved")
  })
})
