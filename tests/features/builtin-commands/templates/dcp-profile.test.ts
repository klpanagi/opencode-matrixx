import { describe, expect, test } from "bun:test"
import { DCP_PROFILE_TEMPLATE } from "../../../../src/features/builtin-commands/templates/dcp-profile"

describe("dcp-profile template", () => {
  test("should export a non-empty template string", () => {
    //#given - the dcp-profile template

    //#when - we access the template

    //#then - it should be a non-empty string
    expect(typeof DCP_PROFILE_TEMPLATE).toBe("string")
    expect(DCP_PROFILE_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should describe the dcp profile switcher behavior", () => {
    //#given - the dcp-profile template

    //#when - we check the content

    //#then - it should mention key behaviors
    expect(DCP_PROFILE_TEMPLATE).toContain("DCP")
    expect(DCP_PROFILE_TEMPLATE).toContain("switch")
    expect(DCP_PROFILE_TEMPLATE).toContain("restart")
  })

  test("should list the four valid profile tiers", () => {
    //#given - the dcp-profile template

    //#when - we inspect profile names

    //#then - economy, balanced, performance, ultimate must all be mentioned
    expect(DCP_PROFILE_TEMPLATE).toContain("economy")
    expect(DCP_PROFILE_TEMPLATE).toContain("balanced")
    expect(DCP_PROFILE_TEMPLATE).toContain("performance")
    expect(DCP_PROFILE_TEMPLATE).toContain("ultimate")
  })

  test("should reference the DCP install location and switch script", () => {
    //#given - the dcp-profile template

    //#when - we look for the install path and script path

    //#then - both should be present
    expect(DCP_PROFILE_TEMPLATE).toContain("@tarquinen/opencode-dcp")
    expect(DCP_PROFILE_TEMPLATE).toContain("switch-profile.sh")
  })

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    expect(emojiRegex.test(DCP_PROFILE_TEMPLATE)).toBe(false)
  })
})
