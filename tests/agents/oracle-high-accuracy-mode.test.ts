import { describe, expect, test } from "bun:test"
import {
  ORACLE_HIGH_ACCURACY_MODE,
  SMITH_MAX_REVIEW_ROUNDS,
  createOracleHighAccuracyMode,
  resolveSmithMaxReviewRounds,
} from "../../src/agents/oracle/high-accuracy-mode"
import {
  ORACLE_SYSTEM_PROMPT,
  createOracleSystemPrompt,
} from "../../src/agents/oracle/system-prompt"
import { PlansConfigSchema } from "../../src/config/schema/plans"

describe("SMITH_MAX_REVIEW_ROUNDS default", () => {
  test("defaults to 8", () => {
    //#given
    const expected = 8

    //#when
    const actual = SMITH_MAX_REVIEW_ROUNDS

    //#then
    expect(actual).toBe(expected)
  })
})

describe("default high accuracy mode prompt", () => {
  test("contains the ceiling 8 and the convergence clause", () => {
    //#given
    const prompt = ORACLE_HIGH_ACCURACY_MODE

    //#when
    const hasCeiling = prompt.includes("round <= 8")
    const hasConvergence = prompt.includes("no NEW issue category")

    //#then
    expect(hasCeiling).toBe(true)
    expect(hasConvergence).toBe(true)
  })

  test("no longer references the removed constant or an unbounded loop", () => {
    //#given
    const prompt = ORACLE_HIGH_ACCURACY_MODE

    //#when
    const hasOldConstant = prompt.includes("SMITH_LOOP_MAX_ITERATIONS")
    const hasUnboundedLoop = prompt.includes("while (true)")

    //#then
    expect(hasOldConstant).toBe(false)
    expect(hasUnboundedLoop).toBe(false)
  })

  test("no longer instructs Smith verdicts about the size gate", () => {
    //#given
    const prompt = ORACLE_HIGH_ACCURACY_MODE

    //#when
    const hasUnenforceableClause = prompt.includes(
      "Smith verdicts and your revisions may only demand removals",
    )

    //#then
    expect(hasUnenforceableClause).toBe(false)
    expect(prompt).toContain("trim_required")
  })
})

describe("createOracleHighAccuracyMode interpolation", () => {
  test("interpolates 3", () => {
    //#given
    const maxRounds = 3

    //#when
    const prompt = createOracleHighAccuracyMode(maxRounds)

    //#then
    expect(prompt).toContain("round <= 3")
  })

  test("interpolates 12", () => {
    //#given
    const maxRounds = 12

    //#when
    const prompt = createOracleHighAccuracyMode(maxRounds)

    //#then
    expect(prompt).toContain("round <= 12")
  })
})

describe("resolveSmithMaxReviewRounds", () => {
  test("returns 8 when config is undefined", () => {
    //#given
    const config = undefined

    //#when
    const resolved = resolveSmithMaxReviewRounds(config)

    //#then
    expect(resolved).toBe(8)
  })

  test("returns the configured value when present", () => {
    //#given
    const config = { plans: { smith_max_review_rounds: 5 } }

    //#when
    const resolved = resolveSmithMaxReviewRounds(config)

    //#then
    expect(resolved).toBe(5)
  })
})

describe("createOracleSystemPrompt", () => {
  test("interpolates the configured ceiling while the default const keeps 8", () => {
    //#given
    const config = { plans: { smith_max_review_rounds: 4 } }

    //#when
    const prompt = createOracleSystemPrompt(config)

    //#then
    expect(prompt).toContain("round <= 4")
    expect(ORACLE_SYSTEM_PROMPT).toContain("round <= 8")
  })
})

describe("PlansConfigSchema smith_max_review_rounds", () => {
  test("defaults to 8 when absent", () => {
    //#given
    const input = {}

    //#when
    const parsed = PlansConfigSchema.parse(input)

    //#then
    expect(parsed.smith_max_review_rounds).toBe(8)
  })

  test("rejects 1 (below min 2)", () => {
    //#given
    const input = { smith_max_review_rounds: 1 }

    //#when
    const result = PlansConfigSchema.safeParse(input)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects 21 (above max 20)", () => {
    //#given
    const input = { smith_max_review_rounds: 21 }

    //#when
    const result = PlansConfigSchema.safeParse(input)

    //#then
    expect(result.success).toBe(false)
  })

  test("accepts the boundaries 2 and 20", () => {
    //#given
    const lower = { smith_max_review_rounds: 2 }
    const upper = { smith_max_review_rounds: 20 }

    //#when
    const lowerResult = PlansConfigSchema.safeParse(lower)
    const upperResult = PlansConfigSchema.safeParse(upper)

    //#then
    expect(lowerResult.success).toBe(true)
    expect(upperResult.success).toBe(true)
  })
})
