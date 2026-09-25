import { describe, expect, test } from "bun:test"
import {
  buildCompactContextDisciplineSection,
  buildContextDisciplineSection,
  buildExploreDisciplineSection,
  buildHeadroomSection,
} from "../../src/agents/dynamic-agent-prompt-builder"
import { getModelDirectives } from "../../src/agents/model-directives"

const DEEPSEEK = "deepseek/deepseek-v4.1-flash"
const ANTHROPIC = "anthropic/claude-sonnet-4"
const MARKER = getModelDirectives(DEEPSEEK).antiEcho!

describe("buildContextDisciplineSection model directives", () => {
  test("includes the anti-echo directive for a deepseek model", () => {
    //#given
    const modelID = DEEPSEEK

    //#when
    const section = buildContextDisciplineSection(true, true, "guided", modelID)

    //#then
    expect(section).toContain(MARKER)
  })

  test("omits the anti-echo directive for an anthropic model", () => {
    //#given
    const modelID = ANTHROPIC

    //#when
    const section = buildContextDisciplineSection(true, true, "guided", modelID)

    //#then
    expect(section).not.toContain(MARKER)
    expect(section.length).toBeGreaterThan(0)
  })
})

describe("other builders model directives", () => {
  test("compact discipline includes directive for deepseek", () => {
    //#given / #when
    const section = buildCompactContextDisciplineSection(true, true, "guided", DEEPSEEK)

    //#then
    expect(section).toContain(MARKER)
  })

  test("compact discipline omits directive for anthropic", () => {
    //#given / #when
    const section = buildCompactContextDisciplineSection(true, true, "guided", ANTHROPIC)

    //#then
    expect(section).not.toContain(MARKER)
  })

  test("headroom section includes directive for deepseek", () => {
    //#given / #when
    const section = buildHeadroomSection(true, "guided", DEEPSEEK)

    //#then
    expect(section).toContain(MARKER)
  })

  test("explore discipline includes directive for deepseek", () => {
    //#given / #when
    const section = buildExploreDisciplineSection(true, false, true, DEEPSEEK)

    //#then
    expect(section).toContain(MARKER)
  })

  test("explore discipline omits directive for anthropic", () => {
    //#given / #when
    const section = buildExploreDisciplineSection(true, false, true, ANTHROPIC)

    //#then
    expect(section).not.toContain(MARKER)
  })
})
