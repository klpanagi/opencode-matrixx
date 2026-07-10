import { describe, expect, test } from "bun:test"
import { createBuiltinSkills } from "../skills"

const skills = createBuiltinSkills()

describe("SDO compliance", () => {
  test("all built-in skill descriptions start with Use when", () => {
    // Access template to trigger lazy hydration (populates description)
    for (const skill of skills) {
      void skill.template
    }

    for (const skill of skills) {
      const first120 = skill.description.slice(0, 120)
      const hasTrigger = /Use when|For .* tasks|Loads when|Triggers:?/i.test(first120)
      expect(
        hasTrigger,
        skill.name + ": first 120 chars lack 'Use when' trigger",
      ).toBe(true)
    }
  })

  test("no description contains MUST USE or STRONGLY RECOMMENDED", () => {
    for (const skill of skills) {
      void skill.template
    }

    const forbidden = [/MUST USE/i, /STRONGLY RECOMMENDED/i]
    for (const skill of skills) {
      for (const pattern of forbidden) {
        expect(
          pattern.test(skill.description),
          skill.name + ': contains "' + pattern.source + '" in description',
        ).toBe(false)
      }
    }
  })

  test("cross-references in descriptions point to real skills", () => {
    for (const skill of skills) {
      void skill.template
    }

    const skillNames = new Set(skills.map((s) => s.name))
    for (const skill of skills) {
      const refMatch = skill.description.match(/Related:\s*([^.]+)/i)
      if (!refMatch) continue
      const refs = refMatch[1].split(",").map((s) => s.trim())
      for (const ref of refs) {
        expect(
          skillNames.has(ref),
          skill.name + ': references unknown skill "' + ref + '"',
        ).toBe(true)
      }
    }
  })
})
