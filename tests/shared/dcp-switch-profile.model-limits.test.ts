/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { DcpConfigSchema } from "../../src/config/schema/dcp"
import { buildInlineConfig } from "../../src/shared/dcp-switch-profile"

describe("buildInlineConfig", () => {
  test("is exported as a function", () => {
    //#given
    const imported = buildInlineConfig

    //#when
    const actual = typeof imported

    //#then
    expect(actual).toBe("function")
  })
})

describe("buildInlineConfig profile compression", () => {
  test("emits softened brutal nudge values", () => {
    //#given
    const compress = compressOf("brutal")

    //#when
    const { nudgeFrequency, iterationNudgeThreshold, nudgeForce } = compress

    //#then
    expect(nudgeFrequency).toBe(3)
    expect(iterationNudgeThreshold).toBe(6)
    expect(nudgeForce).toBe("soft")
  })

  test("leaves other builtin profiles unchanged", () => {
    //#given
    const expected = {
      economy: { nudgeFrequency: 2, iterationNudgeThreshold: 7, nudgeForce: "strong" },
      balanced: { nudgeFrequency: 3, iterationNudgeThreshold: 10, nudgeForce: "strong" },
      performance: { nudgeFrequency: 4, iterationNudgeThreshold: 12, nudgeForce: "strong" },
      ultimate: { nudgeFrequency: 5, iterationNudgeThreshold: 15, nudgeForce: "strong" },
    } as const

    //#when
    const actual = Object.fromEntries(
      Object.keys(expected).map((profile) => {
        const compress = compressOf(profile)
        return [
          profile,
          {
            nudgeFrequency: compress.nudgeFrequency,
            iterationNudgeThreshold: compress.iterationNudgeThreshold,
            nudgeForce: compress.nudgeForce,
          },
        ]
      }),
    )

    //#then
    expect(actual).toEqual(expected)
  })
})

function compressOf(profile: string): Record<string, unknown> {
  return buildInlineConfig(profile).compress as Record<string, unknown>
}

describe("buildInlineConfig model limits", () => {
  test("propagates builtin brutal per-model limits", () => {
    //#given
    const compress = compressOf("brutal")

    //#when
    const modelMaxLimits = compress.modelMaxLimits
    const modelMinLimits = compress.modelMinLimits

    //#then
    expect(modelMaxLimits).toEqual({ "deepseek/deepseek-v4.1-flash": "95%" })
    expect(modelMinLimits).toEqual({ "deepseek/deepseek-v4.1-flash": "90%" })
  })

  test("lets a user profile override win", () => {
    //#given
    const dcp = DcpConfigSchema.parse({
      profiles: { brutal: { compress: { modelMaxLimits: { "custom/model": "50%" } } } },
    })

    //#when
    const compress = buildInlineConfig("brutal", { pluginConfig: { dcp } }).compress as Record<string, unknown>

    //#then
    expect(compress.modelMaxLimits).toEqual({ "custom/model": "50%" })
  })
})
