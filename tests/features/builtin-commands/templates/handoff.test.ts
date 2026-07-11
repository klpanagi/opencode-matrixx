import { describe, expect, test } from "bun:test"
import { HANDOFF_TEMPLATE } from "../../../../src/features/builtin-commands/templates/handoff"

describe("/handoff template", () => {
  test("should export a non-empty template string", () => {
    // given - the handoff template

    // when - we access the template

    // then - it should be a non-empty string
    expect(typeof HANDOFF_TEMPLATE).toBe("string")
    expect(HANDOFF_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should instruct LLM to call the handoff tool", () => {
    // given - the handoff template

    // when - we check the content for tool call patterns

    // then - it should reference handoff() tool call and action='create'
    expect(HANDOFF_TEMPLATE).toMatch(/handoff\(/)
    expect(HANDOFF_TEMPLATE).toMatch(/action/)
  })

  test("should NOT contain 'automatically loaded'", () => {
    // given - the handoff template

    // when - we check the content

    // then - it should not contain the false claim
    expect(HANDOFF_TEMPLATE).not.toContain("automatically loaded")
  })

  test("should NOT contain Write tool or file-write instructions", () => {
    // given - the handoff template

    // when - we check the content

    // then - it should not instruct manual file writing
    expect(HANDOFF_TEMPLATE).not.toMatch(/Write tool|writeFileSync|Write to/i)
  })

  test("should reference action='create' for the handoff tool", () => {
    // given - the handoff template

    // when - we check the content

    // then - it should mention the create action
    expect(HANDOFF_TEMPLATE).toMatch(/action['":= ]+['"]?create/i)
  })

  test("should mention /pickup for loading handoff context", () => {
    // given - the handoff template

    // when - we check the content

    // then - it should tell the user to use /pickup
    expect(HANDOFF_TEMPLATE).toMatch(/\/pickup/)
  })
})
