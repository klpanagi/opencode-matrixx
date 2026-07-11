import { describe, expect, test } from "bun:test"
import { PICKUP_TEMPLATE } from "../../../../src/features/builtin-commands/templates/pickup"

describe("/pickup template", () => {
  test("exports a non-empty template string", () => {
    // given - the pickup template

    // when - we access the template

    // then - it should be a non-empty string
    expect(typeof PICKUP_TEMPLATE).toBe("string")
    expect(PICKUP_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("instructs LLM to use the handoff tool", () => {
    // given - the pickup template

    // when - we check for handoff tool references

    // then - the template should reference the handoff tool
    expect(PICKUP_TEMPLATE).toMatch(/`?handoff`?/)
  })

  test("references both 'read' and 'archive' actions", () => {
    // given - the pickup template

    // when - we check for action references

    // then - both read and archive must be present
    expect(PICKUP_TEMPLATE).toMatch(/read/i)
    expect(PICKUP_TEMPLATE).toMatch(/archive/i)
  })

  test("does not contain direct file-read instructions", () => {
    // given - the pickup template

    // when - we check for read tool or file path references

    // then - no manual file read instructions
    expect(PICKUP_TEMPLATE).not.toMatch(/Read tool|Read the file|\.matrixx\/handoff/i)
  })

  test("does not contain manual archive commands (mv/rename)", () => {
    // given - the pickup template

    // when - we check for mv/rename patterns

    // then - no manual archive commands
    expect(PICKUP_TEMPLATE).not.toMatch(/\bmv\b|rename/i)
  })

  test("handles the 'No handoff found' error case", () => {
    // given - the pickup template

    // when - we check for error handling instructions

    // then - it should instruct the LLM to check for Error: prefix
    expect(PICKUP_TEMPLATE).toMatch(/Error/i)
    expect(PICKUP_TEMPLATE).toMatch(/No handoff/i)
  })
})
