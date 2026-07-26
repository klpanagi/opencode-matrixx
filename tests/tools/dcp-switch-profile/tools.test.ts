import { describe, expect, test } from "bun:test"
import { createDcpSwitchProfileTool } from "../../../src/tools/dcp-switch-profile/tools"

describe("dcp_switch_profile tool", () => {
  test("should export a tool factory", () => {
    const tools = createDcpSwitchProfileTool()
    expect(tools).toHaveProperty("dcp_switch_profile")
  })

  test("should have a description mentioning DCP and profiles", () => {
    const tools = createDcpSwitchProfileTool()
    const desc = tools.dcp_switch_profile.description
    expect(desc).toContain("DCP")
    expect(desc).toContain("profile")
    expect(desc.length).toBeGreaterThan(50)
  })

  test("should define profile argument with enum restriction", () => {
    const tools = createDcpSwitchProfileTool()
    const args = tools.dcp_switch_profile.args as Record<string, unknown>
    expect(args).toHaveProperty("profile")
  })
})
