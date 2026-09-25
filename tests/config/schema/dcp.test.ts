/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { BUILTIN_DCP_PROFILES, DcpCompressOverrideSchema } from "../../../src/config/schema/dcp"

describe("BUILTIN_DCP_PROFILES.brutal", () => {
  test("does not nudge every turn", () => {
    //#given
    const compress = BUILTIN_DCP_PROFILES.brutal.compress

    //#when
    const { nudgeFrequency, iterationNudgeThreshold, nudgeForce } = compress

    //#then
    expect(nudgeFrequency).toBeGreaterThanOrEqual(3)
    expect(iterationNudgeThreshold).toBeGreaterThanOrEqual(6)
    expect(nudgeForce).toBe("soft")
  })

  test("carries DeepSeek per-model context limits", () => {
    //#given
    const compress = BUILTIN_DCP_PROFILES.brutal.compress

    //#when
    const max = compress.modelMaxLimits
    const min = compress.modelMinLimits

    //#then
    expect(max?.["deepseek/deepseek-v4.1-flash"]).toBe("95%")
    expect(min?.["deepseek/deepseek-v4.1-flash"]).toBe("90%")
  })
})

describe("DcpCompressOverrideSchema model limits", () => {
  test("accepts provider/model keyed percent and number values", () => {
    //#given
    const input = {
      modelMaxLimits: { "deepseek/deepseek-v4.1-flash": "95%" },
      modelMinLimits: { "deepseek/deepseek-v4.1-flash": 90 },
    }

    //#when
    const parsed = DcpCompressOverrideSchema.safeParse(input)

    //#then
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.modelMaxLimits).toEqual({ "deepseek/deepseek-v4.1-flash": "95%" })
    expect(parsed.success && parsed.data.modelMinLimits).toEqual({ "deepseek/deepseek-v4.1-flash": 90 })
  })

  test("rejects a key without provider/model shape", () => {
    //#given
    const input = { modelMaxLimits: { "no-slash": "95%" } }

    //#when
    const parsed = DcpCompressOverrideSchema.safeParse(input)

    //#then
    expect(parsed.success).toBe(false)
  })
})
