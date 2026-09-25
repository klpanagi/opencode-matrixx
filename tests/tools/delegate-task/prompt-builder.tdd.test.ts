/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { buildSystemContent } from "../../../src/tools/delegate-task/prompt-builder"

describe("buildSystemContent TDD banner", () => {
  test("includes test-first marker when skill content is absent", () => {
    //#given
    const input = { skillContent: undefined, category: "source" }

    //#when
    const result = buildSystemContent(input)

    //#then
    expect(result).toBeDefined()
    expect(result).toContain("NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST")
    expect(result).toContain("RED")
  })

  test("includes test-first marker when skill content is present", () => {
    //#given
    const input = { skillContent: "some skill content", category: "source" }

    //#when
    const result = buildSystemContent(input)

    //#then
    expect(result).toBeDefined()
    expect(result).toContain("some skill content")
    expect(result).toContain("NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST")
    expect(result).toContain("RED")
  })

  test("includes test-first marker with category append and no skill", () => {
    //#given
    const input = { categoryPromptAppend: "category context", skillContent: undefined, category: "source" }

    //#when
    const result = buildSystemContent(input)

    //#then
    expect(result).toBeDefined()
    expect(result).toContain("category context")
    expect(result).toContain("NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST")
    expect(result).toContain("RED")
  })

  test("includes skill content, category append, and test-first marker when both present", () => {
    //#given
    const input = { skillContent: "some skill content", categoryPromptAppend: "category context", category: "source" }

    //#when
    const result = buildSystemContent(input)

    //#then
    expect(result).toBeDefined()
    expect(result).toContain("some skill content")
    expect(result).toContain("category context")
    expect(result).toContain("NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST")
    expect(result).toContain("RED")
    expect(result!.indexOf("some skill content")).toBeLessThan(result!.indexOf("category context"))
    expect(result!.indexOf("category context")).toBeLessThan(
      result!.indexOf("NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST"),
    )
  })
})
