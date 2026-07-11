import { describe, expect, test } from "bun:test"
import { clearLazyTemplateCache, createLazyTemplateSkill } from "../../../src/features/builtin-skills/lazy-skill-helper"
import type { BuiltinSkill } from "../../../src/features/builtin-skills/types"

describe("createLazyTemplateSkill", () => {
  test("returns object matching BuiltinSkill shape", () => {
    // given
    const skill = createLazyTemplateSkill("test", () => ({
      name: "test",
      description: "d",
      template: "hello",
    }))

    // then
    expect(skill).toHaveProperty("name", "test")
    expect(skill).toHaveProperty("description", "")
    expect(skill).toHaveProperty("template")
    expect(skill.name).toBe("test")
  })

  test("template is NOT loaded at construction time (factory not called)", () => {
    // given
    let loaded = false
    const factory = () => {
      loaded = true
      return { name: "lt", description: "", template: "xyz" }
    }

    // when
    createLazyTemplateSkill("lazy-test-1", factory)

    // then
    expect(loaded).toBe(false)
  })

  test("template IS loaded on first .template access", () => {
    // given
    let loaded = false
    const factory = () => {
      loaded = true
      return { name: "lt", description: "", template: "xyz" }
    }

    // when
    const skill = createLazyTemplateSkill("lazy-test-2", factory)

    // then
    expect(loaded).toBe(false)
    expect(skill.template).toBe("xyz")
    expect(loaded).toBe(true)
  })

  test("template is cached after first access (factory called once)", () => {
    // given
    let callCount = 0
    const skill = createLazyTemplateSkill("cache-test", () => {
      callCount++
      return { name: "ct", description: "", template: "abc" }
    })

    // when - access template multiple times
    const t1 = skill.template
    const t2 = skill.template
    const t3 = skill.template

    // then
    expect(callCount).toBe(1)
    expect(t1).toBe("abc")
    expect(t2).toBe("abc")
    expect(t3).toBe("abc")
  })

  test("self-destructing getter replaces getter with value after first access", () => {
    // given
    const skill = createLazyTemplateSkill("selfdestruct-test", () => ({
      name: "sd",
      description: "",
      template: "val",
    }))

    // when - first access triggers getter which self-destructs
    skill.template

    // then - descriptor should be a value property, not a getter
    const descriptor = Object.getOwnPropertyDescriptor(skill, "template")
    expect(descriptor).toBeDefined()
    expect(descriptor?.get).toBeUndefined()
    expect(descriptor?.value).toBe("val")
    expect(descriptor?.writable).toBe(true)
    expect(descriptor?.enumerable).toBe(true)
    expect(descriptor?.configurable).toBe(true)
  })

  test("template is enumerable (visible in Object.keys)", () => {
    // given
    const skill = createLazyTemplateSkill("enum-test", () => ({
      name: "et",
      description: "",
      template: "xyz",
    }))

    // when
    const keys = Object.keys(skill)

    // then
    expect(keys).toContain("template")
    expect(keys).toContain("name")
    expect(keys).toContain("description")

    // and JSON.stringify includes template
    const json = JSON.parse(JSON.stringify(skill))
    expect(json.template).toBe("xyz")
  })

  test("is assignable to BuiltinSkill type", () => {
    // given
    const skill = createLazyTemplateSkill("type-test", () => ({
      name: "tt",
      description: "",
      template: "hello",
    }))

    // when - assign to a BuiltinSkill variable
    const typed: BuiltinSkill = skill

    // then
    expect(typed).toBeDefined()
  })

  test("clearLazyTemplateCache resets cache", () => {
    // given
    let callCount = 0
    const factory = () => {
      callCount++
      return { name: "cc", description: "", template: "val" }
    }

    const skill1 = createLazyTemplateSkill("clear-test", factory)
    skill1.template // first access — caches
    expect(callCount).toBe(1)

    // when
    clearLazyTemplateCache()

    // then - new template access triggers factory again
    const skill2 = createLazyTemplateSkill("clear-test", factory)
    expect(skill2.template).toBe("val")
    expect(callCount).toBe(2)
  })

  test("description is hydrated on every template access, even when template cache is already populated (regression for cache-poisoning bug)", () => {
    // given - first skill instance populates the cache
    const skill1 = createLazyTemplateSkill("regression-test", () => ({
      name: "rt",
      description: "first-skill-description",
      template: "first-template",
    }))
    void skill1.template
    expect(skill1.description).toBe("first-skill-description")

    // when - a new instance is created with the same name (test re-run scenario)
    const skill2 = createLazyTemplateSkill("regression-test", () => ({
      name: "rt",
      description: "second-skill-description",
      template: "second-template",
    }))

    // then - description is hydrated even though template is already cached
    void skill2.template
    expect(skill2.description).toBe("first-skill-description")
    expect(skill2.template).toBe("first-template")
  })
})
