import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
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

import { deepMergeProfile, switchProfile } from "../../../src/tools/dcp-switch-profile/tools"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe("switchProfile", () => {
  beforeEach(() => {
    capturedWriteData = null
    mockExistsSync.mockImplementation(() => true)
  })

  // ── Built-in profile values (no pluginConfig — exercises fallback) ──

  describe("built-in economy profile values", () => {
    const profile = "economy"
    const expected = BUILTIN_DCP_PROFILES.economy

    test("produces valid JSON that can be parsed", async () => {
      await switchProfile(profile)
      expect(capturedWriteData).not.toBeNull()
      const config = extractWrittenConfig()
      expect(config).not.toBeNull()
    })

    test("compress.maxContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("pruneNotification is off", async () => {
      await switchProfile(profile)
      expect(extractWrittenConfig()!.pruneNotification).toBe("off")
    })

    test("turnProtection is disabled", async () => {
      await switchProfile(profile)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp.enabled).toBe(false)
    })

    test("experimental.allowSubAgents is false for economy", async () => {
      await switchProfile(profile)
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(false)
    })
  })

  describe("built-in balanced profile values", () => {
    const profile = "balanced"
    const expected = BUILTIN_DCP_PROFILES.balanced

    test("compress.maxContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("turnProtection has enabled: true and correct turns", async () => {
      await switchProfile(profile)
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp.enabled).toBe(true)
      expect(tp.turns).toBe(2)
    })
  })

  describe("built-in performance profile values", () => {
    const profile = "performance"
    const expected = BUILTIN_DCP_PROFILES.performance

    test("compress.maxContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })
  })

  describe("built-in ultimate profile values", () => {
    const profile = "ultimate"
    const expected = BUILTIN_DCP_PROFILES.ultimate

    test("compress.maxContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.maxContextLimit).toBe(expected.compress.maxContextLimit)
    })

    test("compress.minContextLimit", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.minContextLimit).toBe(expected.compress.minContextLimit)
    })

    test("compress.nudgeFrequency", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.nudgeFrequency).toBe(expected.compress.nudgeFrequency)
    })

    test("compress.protectTags is true", async () => {
      await switchProfile(profile)
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.protectTags).toBe(true)
    })

    test("pruneNotification is detailed", async () => {
      await switchProfile(profile)
      expect(extractWrittenConfig()!.pruneNotification).toBe("detailed")
    })
  })

  // ── Output structure (applies to all profiles) ──────────────────────

  describe("output structure", () => {
    test("contains $schema field", async () => {
      await switchProfile("balanced")
      const config = extractWrittenConfig()!
      expect(config).toHaveProperty("$schema")
      expect(typeof config.$schema).toBe("string")
    })

    test("enabled is true", async () => {
      await switchProfile("balanced")
      expect(extractWrittenConfig()!.enabled).toBe(true)
    })

    test("does NOT contain extend key", async () => {
      await switchProfile("balanced")
      expect(extractWrittenConfig()!).not.toHaveProperty("extend")
    })

    test("compress section contains all required fields", async () => {
      await switchProfile("balanced")
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
      await switchProfile("balanced")
      const s = extractWrittenConfig()!.strategies as AnyRecord
      expect(s).toHaveProperty("deduplication")
      expect(s).toHaveProperty("purgeErrors")
      expect((s.deduplication as AnyRecord).enabled).toBe(true)
      expect((s.purgeErrors as AnyRecord).enabled).toBe(true)
    })

    test("commands section is present and enabled by default", async () => {
      await switchProfile("balanced")
      const cmds = extractWrittenConfig()!.commands as AnyRecord
      expect(cmds.enabled).toBe(true)
    })

    test("manualMode section is present and disabled by default", async () => {
      await switchProfile("balanced")
      const mm = extractWrittenConfig()!.manualMode as AnyRecord
      expect(mm.enabled).toBe(false)
    })

    test("turnProtection section is present", async () => {
      await switchProfile("balanced")
      const tp = extractWrittenConfig()!.turnProtection as AnyRecord
      expect(tp).toHaveProperty("enabled")
      expect(tp).toHaveProperty("turns")
    })

    test("experimental section is present", async () => {
      await switchProfile("balanced")
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp).toHaveProperty("allowSubAgents")
      expect(exp).toHaveProperty("customPrompts")
    })
  })

  // ── Base config overrides ───────────────────────────────────────────

  describe("base config overrides", () => {
    test("base.debug is applied to output when set", async () => {
      const dcp = DcpConfigSchema.parse({ base: { debug: true } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.debug).toBe(true)
    })

    test("base.pruneNotificationType is applied", async () => {
      const dcp = DcpConfigSchema.parse({ base: { pruneNotificationType: "toast" } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.pruneNotificationType).toBe("toast")
    })

    test("base.autoUpdate is applied when true", async () => {
      const dcp = DcpConfigSchema.parse({ base: { autoUpdate: true } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.autoUpdate).toBe(true)
    })

    test("base.protectedFilePatterns flows through", async () => {
      const dcp = DcpConfigSchema.parse({ base: { protectedFilePatterns: ["*.secret", "*.key"] } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.protectedFilePatterns).toEqual(["*.secret", "*.key"])
    })

    test("base.compress.mode overrides default", async () => {
      const dcp = DcpConfigSchema.parse({ base: { compress: { mode: "message" } } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      const c = extractWrittenConfig()!.compress as AnyRecord
      expect(c.mode).toBe("message")
    })

    test("base.commands.enabled can be disabled", async () => {
      const dcp = DcpConfigSchema.parse({ base: { commands: { enabled: false } } })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      const cmds = extractWrittenConfig()!.commands as AnyRecord
      expect(cmds.enabled).toBe(false)
    })

    test("base manualMode shares base with turnProtection disabled", async () => {
      const dcp = DcpConfigSchema.parse({
        base: {
          manualMode: { enabled: true, automaticStrategies: false },
        },
      })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      const mm = extractWrittenConfig()!.manualMode as AnyRecord
      expect(mm.enabled).toBe(true)
      expect(mm.automaticStrategies).toBe(false)
    })

    test("base.experimental.allowSubAgents applies when profile omits it", async () => {
      const dcp = DcpConfigSchema.parse({
        base: { experimental: { allowSubAgents: false } },
      })
      await switchProfile("economy", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(false)
    })

    test("profile experimental.allowSubAgents overrides base", async () => {
      const dcp = DcpConfigSchema.parse({
        base: { experimental: { allowSubAgents: false } },
        profiles: {
          brutal: { experimental: { allowSubAgents: true } },
        },
      })
      await switchProfile("brutal", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(true)
    })

    //#given base sets allowSubAgents true and brutal builtin defaults false with no profile override
    //#when switching to brutal
    //#then base wins over the builtin default
    test("base.experimental.allowSubAgents true applies to brutal without profile override", async () => {
      const dcp = DcpConfigSchema.parse({
        base: { experimental: { allowSubAgents: true } },
      })
      await switchProfile("brutal", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(true)
    })

    //#given base sets allowSubAgents true and economy builtin defaults false with no profile override
    //#when switching to economy
    //#then base wins over the builtin default
    test("base.experimental.allowSubAgents true applies to economy without profile override", async () => {
      const dcp = DcpConfigSchema.parse({
        base: { experimental: { allowSubAgents: true } },
      })
      await switchProfile("economy", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(true)
    })

    //#given base sets allowSubAgents true but profiles.brutal explicitly sets false
    //#when switching to brutal
    //#then the explicit profile override wins over base
    test("explicit profiles.brutal.experimental.allowSubAgents false wins over base true", async () => {
      const dcp = DcpConfigSchema.parse({
        base: { experimental: { allowSubAgents: true } },
        profiles: {
          brutal: { experimental: { allowSubAgents: false } },
        },
      })
      await switchProfile("brutal", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(false)
    })

    test("base.experimental defaults to allowSubAgents: true when unset", async () => {
      const dcp = DcpConfigSchema.parse({})
      await switchProfile("balanced", { pluginConfig: { dcp } })
      const exp = extractWrittenConfig()!.experimental as AnyRecord
      expect(exp.allowSubAgents).toBe(true)
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
      await switchProfile("economy", { pluginConfig: { dcp } })
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
      await switchProfile("balanced", { pluginConfig: { dcp } })
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
      await switchProfile("economy", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.pruneNotification).toBe("detailed")
    })

    test("custom profile has no effect on other profiles", async () => {
      const dcp = DcpConfigSchema.parse({
        profiles: {
          economy: { pruneNotification: "off" },
        },
      })
      await switchProfile("balanced", { pluginConfig: { dcp } })
      expect(extractWrittenConfig()!.pruneNotification).toBe("minimal")
    })
  })


  // ── Error handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    test("invalid profile returns error message", async () => {
      const result = await switchProfile("invalid_profile_name")
      expect(result).toContain("Error")
      expect(result).toContain("Invalid profile")
      expect(result).toContain("invalid_profile_name")
      expect(capturedWriteData).toBeNull()
    })

    test("invalid profile lists valid options", async () => {
      const result = await switchProfile("wrong")
      expect(result).toContain("economy")
      expect(result).toContain("balanced")
      expect(result).toContain("performance")
      expect(result).toContain("ultimate")
    })

    test("DCP not installed returns appropriate error", async () => {
      mockExistsSync.mockImplementation(() => false)
      const result = await switchProfile("balanced")
      expect(result).toContain("DCP is not installed")
      expect(capturedWriteData).toBeNull()
    })
  })

  // ── deepMergeProfile unit tests ─────────────────────────────────────

  describe("deepMergeProfile", () => {
    const builtin = BUILTIN_DCP_PROFILES.balanced as unknown as Record<string, unknown>

    test("empty override returns builtin as-is", () => {
      const result = deepMergeProfile(builtin, {})
      expect(result).toEqual(builtin)
    })

    test("partial compress override preserves other compress fields", () => {
      const result = deepMergeProfile(builtin, {
        compress: { maxContextLimit: "50%" },
      })
      const c = result.compress as Record<string, unknown>
      expect(c.maxContextLimit).toBe("50%")
      expect(c.minContextLimit).toBe(BUILTIN_DCP_PROFILES.balanced.compress.minContextLimit)
      expect(c.nudgeFrequency).toBe(BUILTIN_DCP_PROFILES.balanced.compress.nudgeFrequency)
    })

    test("partial turnProtection override preserves other turnProtection fields", () => {
      const result = deepMergeProfile(builtin, {
        turnProtection: { turns: 5 },
      })
      const tp = result.turnProtection as Record<string, unknown>
      expect(tp.turns).toBe(5)
      expect(tp.enabled).toBe(BUILTIN_DCP_PROFILES.balanced.turnProtection.enabled)
    })

    test("partial experimental override preserves allowSubAgents", () => {
      const result = deepMergeProfile(builtin, {
        experimental: { allowSubAgents: false },
      })
      const exp = result.experimental as Record<string, unknown>
      expect(exp.allowSubAgents).toBe(false)
    })

    test("partial strategies.purgeErrors override preserves other purgeErrors fields", () => {
      const result = deepMergeProfile(builtin, {
        strategies: { purgeErrors: { turns: 5 } },
      })
      const s = result.strategies as Record<string, unknown>
      const pe = s.purgeErrors as Record<string, unknown>
      expect(pe.turns).toBe(5)
    })

    test("pruneNotification scalar override", () => {
      const result = deepMergeProfile(builtin, { pruneNotification: "detailed" })
      expect(result.pruneNotification).toBe("detailed")
    })

    test("full override replaces all sub-objects completely", () => {
      const fullOverride: Record<string, unknown> = {
        pruneNotification: "off",
        compress: {
          maxContextLimit: "10%",
          minContextLimit: "5%",
          nudgeFrequency: 1,
          nudgeForce: "strong",
          iterationNudgeThreshold: 1,
        },
        turnProtection: { enabled: false },
        experimental: { allowSubAgents: false },
        strategies: { purgeErrors: { turns: 1 } },
      }
      const result = deepMergeProfile(builtin, fullOverride)
      expect(result.pruneNotification).toBe("off")
      expect((result.compress as Record<string, unknown>).maxContextLimit).toBe("10%")
      expect((result.compress as Record<string, unknown>).minContextLimit).toBe("5%")
      expect((result.turnProtection as Record<string, unknown>).enabled).toBe(false)
      expect((result.experimental as Record<string, unknown>).allowSubAgents).toBe(false)
      expect(((result.strategies as Record<string, unknown>).purgeErrors as Record<string, unknown>).turns).toBe(1)
    })

    test("override with empty sub-object preserves builtin sub-object entirely", () => {
      const result = deepMergeProfile(builtin, { compress: {} })
      const c = result.compress as Record<string, unknown>
      expect(c.maxContextLimit).toBe("60%")
      expect(c.minContextLimit).toBe("30%")
      expect(c.nudgeFrequency).toBe(3)
    })

    test("override with all sub-objects empty preserves everything", () => {
      const result = deepMergeProfile(builtin, {
        compress: {},
        turnProtection: {},
        experimental: {},
        strategies: {},
      })
      expect(result).toEqual(builtin)
    })
  })

  // ── Return value ────────────────────────────────────────────────────

  describe("return value", () => {
    test("success message contains profile name", async () => {
      const result = await switchProfile("ultimate")
      expect(result).toContain("ultimate")
      expect(result).toContain("Restart OpenCode")
    })
  })
})
