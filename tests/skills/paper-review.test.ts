/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"

import { createBuiltinSkills } from "../../src/features/builtin-skills/skills"
import { BuiltinSkillNameSchema } from "../../src/config/schema/agent-names"

const EXPECTED_SKILLS = ["paper-review", "paper-review-deep", "eu-proposal-review"] as const

describe("paper-review skills registration", () => {
  test("createBuiltinSkills() includes all three review skills", () => {
    //#given
    const expected = [...EXPECTED_SKILLS]

    //#when
    const skills = createBuiltinSkills()
    const names = skills.map((s) => s.name)

    //#then
    for (const name of expected) {
      expect(names).toContain(name)
    }
  })

  test("V1 paper-review template contains weight and evidence tokens", () => {
    //#given
    const skills = createBuiltinSkills()
    const v1 = skills.find((s) => s.name === "paper-review")

    //#when
    const template = String(v1?.template ?? "")

    //#then
    expect(v1).toBeDefined()
    for (const token of ["0.25", "overall =", "ethics_gate", "quote", "NeurIPS"]) {
      expect(template).toContain(token)
    }
  })

  test("BuiltinSkillNameSchema accepts the three review skill names", () => {
    //#given
    const names = [...EXPECTED_SKILLS]

    //#when
    const results = names.map((name) => BuiltinSkillNameSchema.safeParse(name))

    //#then
    for (const result of results) {
      expect(result.success).toBe(true)
    }
  })

  test("review skill templates resolve to non-empty prompts", () => {
    //#given
    const skills = createBuiltinSkills()

    //#when
    const templates = [...EXPECTED_SKILLS].map(
      (name) => skills.find((s) => s.name === name)?.template,
    )

    //#then
    for (const template of templates) {
      expect(typeof template).toBe("string")
      expect(String(template).length).toBeGreaterThan(100)
    }
  })
})
