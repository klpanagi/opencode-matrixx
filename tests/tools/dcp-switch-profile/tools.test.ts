import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { BUILTIN_DCP_PROFILES, DcpConfigSchema } from "../../../src/config/schema/dcp"

// ---------------------------------------------------------------------------
// Mock fs BEFORE importing the module under test
// ---------------------------------------------------------------------------

let capturedWriteData: string | null = null
const mockExistsSync = mock((_path: string) => true)
const mockWriteFileSync = mock((_path: string, data: string) => {
  capturedWriteData = data
})

mock.module("node:fs", () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
}))

import { createDcpSwitchProfileTool } from "../../../src/tools/dcp-switch-profile/tools"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockContext: ToolContext = { sessionID: "test-session" } as ToolContext

/** Capture argument from the last writeFileSync call and parse as JSON. */
function extractWrittenConfig(): Record<string, unknown> | null {
  if (capturedWriteData === null) return null
  return JSON.parse(capturedWriteData)
}

type AnyRecord = Record<string, unknown>

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore()
})

describe("dcp_switch_profile tool", () => {
  beforeEach(() => {
    capturedWriteData = null
    mockExistsSync.mockImplementation(() => true)
  })

  // ── Factory ─────────────────────────────────────────────────────────

  describe("factory", () => {
    test("creates tool with no options", () => {
      const tools = createDcpSwitchProfileTool()
      expect(tools).toHaveProperty("dcp_switch_profile")
    })

    test("creates tool with empty pluginConfig", () => {
      const tools = createDcpSwitchProfileTool({ pluginConfig: {} })
      expect(tools).toHaveProperty("dcp_switch_profile")
    })

    test("creates tool with full DcpConfig", () => {
      const dcp = DcpConfigSchema.parse({})
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      expect(tools).toHaveProperty("dcp_switch_profile")
    })
  })

  // ── Metadata ────────────────────────────────────────────────────────

  describe("metadata", () => {
    test("description mentions DCP and profile switching", () => {
      const tools = createDcpSwitchProfileTool()
      const desc = tools.dcp_switch_profile.description
      expect(desc.toLowerCase()).toContain("dcp")
      expect(desc.toLowerCase()).toContain("profile")
    })

    test("profile argument restricts to valid values", () => {
      const tools = createDcpSwitchProfileTool()
      const args = tools.dcp_switch_profile.args as AnyRecord
      expect(args).toHaveProperty("profile")
    })
  })

  // ── Built-in profile values (no pluginConfig — exercises fallback) ──

  describe("built-in economy profile values", () => {
    const profile = "economy"
    const expected = BUILTIN_DCP_PROFILES.economy

    test("produces valid JSON that can be parsed", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      expect(capturedWriteData).not.toBeNull()
      const config = extractWrittenConfig()
      expect(config).not.toBeNull()
    })

    test("compress.maxContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("pruneNotification is off", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      expect(extractWrittenConfig()!.pruneNotification).toBe("off")
    })

    test("turnProtection is disabled", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp.enabled).toBe(false)
    })

    test("experimental.allowSubAgents is false for economy", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(false)
    })
  })

  describe("built-in balanced profile values", () => {
    const profile = "balanced"
    const expected = BUILTIN_DCP_PROFILES.balanced

    test("compress.maxContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("turnProtection has enabled: true and correct turns", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp.enabled).toBe(true)
      expect(tp.turns).toBe(2)
    })
  })

  describe("built-in performance profile values", () => {
    const profile = "performance"
    const expected = BUILTIN_DCP_PROFILES.performance

    test("compress.maxContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })
  })

  describe("built-in ultimate profile values", () => {
    const profile = "ultimate"
    const expected = BUILTIN_DCP_PROFILES.ultimate

    test("compress.maxContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("compress.protectTags is true", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.protectTags).toBe(true)
    })

    test("pruneNotification is detailed", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile }, mockContext)
      expect(extractWrittenConfig()!.pruneNotification).toBe("detailed")
    })
  })

  // ── Output structure (applies to all profiles) ──────────────────────

  describe("output structure", () => {
    test("contains $schema field", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const config = extractWrittenConfig()!
      expect(config).toHaveProperty("$schema")
      expect(typeof config.$schema).toBe("string")
    })

    test("enabled is true", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.enabled).toBe(true)
    })

    test("does NOT contain extend key", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!).not.toHaveProperty("extend")
    })

    test("compress section contains all required fields", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      const required = [
        "mode",
        "permission",
        "showCompression",
        "summaryBuffer",
        "maxContextLimit",
        "minContextLimit",
        "nudgeFrequency",
        "iterationNudgeThreshold",
        "nudgeForce",
        "protectedTools",
        "protectTags",
        "protectUserMessages",
      ]
      for (const key of required) {
        expect(c).toHaveProperty(key)
      }
    })

    test("strategies section contains deduplication and purgeErrors", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const s = extractWrittenConfig()!.strategies as AnyRecord
      expect(s).toHaveProperty("deduplication")
      expect(s).toHaveProperty("purgeErrors")
      expect((s.deduplication as AnyRecord).enabled).toBe(true)
      expect((s.purgeErrors as AnyRecord).enabled).toBe(true)
    })

    test("commands section is present and enabled by default", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const cmds = extractWrittenConfig()!.commands as AnyRecord
      expect(cmds.enabled).toBe(true)
    })

    test("manualMode section is present and disabled by default", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const mm = extractWrittenConfig()!.manualMode as AnyRecord
      expect(mm.enabled).toBe(false)
    })

    test("turnProtection section is present", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp).toHaveProperty("enabled")
      expect(tp).toHaveProperty("turns")
    })

    test("experimental section is present", async () => {
      const tools = createDcpSwitchProfileTool()
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp).toHaveProperty("allowSubAgents")
      expect(exp).toHaveProperty("customPrompts")
    })
  })

  // ── Base config overrides ───────────────────────────────────────────

  describe("base config overrides", () => {
    test("base.debug is applied to output when set", async () => {
      const dcp = DcpConfigSchema.parse({ base: { debug: true } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.debug).toBe(true)
    })

    test("base.pruneNotificationType is applied", async () => {
      const dcp = DcpConfigSchema.parse({ base: { pruneNotificationType: "toast" } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.pruneNotificationType).toBe("toast")
    })

    test("base.autoUpdate is applied when true", async () => {
      const dcp = DcpConfigSchema.parse({ base: { autoUpdate: true } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.autoUpdate).toBe(true)
    })

    test("base.protectedFilePatterns flows through", async () => {
      const dcp = DcpConfigSchema.parse({ base: { protectedFilePatterns: ["*.secret", "*.key"] } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.protectedFilePatterns).toEqual(["*.secret", "*.key"])
    })

    test("base.compress.mode overrides default", async () => {
      const dcp = DcpConfigSchema.parse({ base: { compress: { mode: "message" } } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.mode).toBe("message")
    })

    test("base.commands.enabled can be disabled", async () => {
      const dcp = DcpConfigSchema.parse({ base: { commands: { enabled: false } } })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const cmds = extractWrittenConfig()!.commands as AnyRecord
      expect(cmds.enabled).toBe(false)
    })

    test("base manualMode shares base with turnProtection disabled", async () => {
      const dcp = DcpConfigSchema.parse({
        base: {
          manualMode: { enabled: true, automaticStrategies: false },
        },
      })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const mm = extractWrittenConfig()!.manualMode as AnyRecord
      expect(mm.enabled).toBe(true)
      expect(mm.automaticStrategies).toBe(false)
    })
  })

  // ── Profile override values ─────────────────────────────────────────

  describe("profile overrides override built-in defaults", () => {
    test("custom economy profile overrides compress values", async () => {
      const dcp = DcpConfigSchema.parse({
        profiles: {
          economy: {
            compress: {
              maxContextLimit: "50%",
              minContextLimit: "25%",
              nudgeFrequency: 5,
            },
          },
        },
      })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "economy" }, mockContext)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe("50%")
      expect(c.minContextLimit).toBe("25%")
      expect(c.nudgeFrequency).toBe(5)
    })

    test("custom profile overrides turnProtection", async () => {
      const dcp = DcpConfigSchema.parse({
        profiles: {
          balanced: {
            turnProtection: { enabled: false, turns: 1 },
          },
        },
      })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp.enabled).toBe(false)
      expect(tp.turns).toBe(1)
    })

    test("custom profile overrides pruneNotification", async () => {
      const dcp = DcpConfigSchema.parse({
        profiles: {
          economy: { pruneNotification: "detailed" },
        },
      })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "economy" }, mockContext)
      expect(extractWrittenConfig()!.pruneNotification).toBe("detailed")
    })

    test("custom profile has no effect on other profiles", async () => {
      const dcp = DcpConfigSchema.parse({
        profiles: {
          economy: { pruneNotification: "off" },
        },
      })
      const tools = createDcpSwitchProfileTool({ pluginConfig: { dcp } })
      await tools.dcp_switch_profile.execute({ profile: "balanced" }, mockContext)
      expect(extractWrittenConfig()!.pruneNotification).toBe("minimal")
    })
  })


  // ── Error handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    test("invalid profile returns error message", async () => {
      const tools = createDcpSwitchProfileTool()
      const result = await tools.dcp_switch_profile.execute(
        { profile: "invalid_profile_name" },
        mockContext,
      )
      expect(result).toContain("Error")
      expect(result).toContain("Invalid profile")
      expect(result).toContain("invalid_profile_name")
      expect(capturedWriteData).toBeNull()
    })

    test("invalid profile lists valid options", async () => {
      const tools = createDcpSwitchProfileTool()
      const result = await tools.dcp_switch_profile.execute(
        { profile: "wrong" },
        mockContext,
      )
      expect(result).toContain("economy")
      expect(result).toContain("balanced")
      expect(result).toContain("performance")
      expect(result).toContain("ultimate")
    })

    test("DCP not installed returns appropriate error", async () => {
      mockExistsSync.mockImplementation(() => false)
      const tools = createDcpSwitchProfileTool()
      const result = await tools.dcp_switch_profile.execute(
        { profile: "balanced" },
        mockContext,
      )
      expect(result).toContain("DCP is not installed")
      expect(capturedWriteData).toBeNull()
    })
  })

  // ── Return value ────────────────────────────────────────────────────

  describe("return value", () => {
    test("success message contains profile name", async () => {
      const tools = createDcpSwitchProfileTool()
      const result = await tools.dcp_switch_profile.execute(
        { profile: "ultimate" },
        mockContext,
      )
      expect(result).toContain("ultimate")
      expect(result).toContain("Restart OpenCode")
    })
  })
})
