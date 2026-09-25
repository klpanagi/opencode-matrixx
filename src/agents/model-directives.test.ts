import { describe, expect, test } from "bun:test"
import { appendModelDirective, getModelDirectives, resolveModelFamily } from "./model-directives"

describe("model-directives", () => {
  test("returns anti-echo and nudge directives for a deepseek model", () => {
    //#given
    const modelID = "deepseek/deepseek-v4.1-flash"

    //#when
    const directives = getModelDirectives(modelID)

    //#then
    expect(directives.antiEcho).toBeDefined()
    expect(directives.nudgeHandling).toBeDefined()
  })

  test("returns no directives for a non-deepseek model", () => {
    //#given
    const modelID = "anthropic/claude-sonnet-4"

    //#when
    const directives = getModelDirectives(modelID)

    //#then
    expect(directives).toEqual({})
  })

  test("returns no directives when the model id is undefined", () => {
    //#given
    const modelID = undefined

    //#when
    const directives = getModelDirectives(modelID)

    //#then
    expect(directives).toEqual({})
  })

  test("resolves the deepseek family from a model id", () => {
    //#given
    const modelID = "deepseek/deepseek-v4.1-flash"

    //#when
    const family = resolveModelFamily(modelID)

    //#then
    expect(family).toBe("deepseek")
  })

  test("appends directive text for a deepseek model", () => {
    //#given
    const section = "### Context Discipline"
    const marker = getModelDirectives("deepseek/deepseek-v4.1-flash").antiEcho!

    //#when
    const result = appendModelDirective(section, "deepseek/deepseek-v4.1-flash")

    //#then
    expect(result).toContain(marker)
  })

  test("returns the section unchanged when no directives apply", () => {
    //#given
    const section = "### Context Discipline"

    //#when
    const result = appendModelDirective(section, "anthropic/claude-sonnet-4")

    //#then
    expect(result).toBe(section)
  })
})
