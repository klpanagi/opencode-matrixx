/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { MatrixxConfigSchema, PlansConfigSchema } from "../../src/config/schema"
import { MAX_PLAN_FILE_BYTES, resolvePlanCap } from "../../src/features/mission-state/constants"

describe("plans.max_plan_file_bytes config", () => {
  test("defaults to 102400 when key is omitted", () => {
    //#given
    const raw = {}

    //#when
    const result = PlansConfigSchema.parse(raw)

    //#then
    expect(result.max_plan_file_bytes).toBe(102_400)
  })

  test("accepts a custom value via MatrixxConfig", () => {
    //#given
    const raw = { plans: { max_plan_file_bytes: 204_800 } }

    //#when
    const result = MatrixxConfigSchema.parse(raw)

    //#then
    expect(result.plans?.max_plan_file_bytes).toBe(204_800)
  })

  test("rejects below-min values", () => {
    //#given
    const raw = { max_plan_file_bytes: 1024 }

    //#when
    const result = PlansConfigSchema.safeParse(raw)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects above-max values", () => {
    //#given
    const raw = { max_plan_file_bytes: 1024 * 1024 }

    //#when
    const result = PlansConfigSchema.safeParse(raw)

    //#then
    expect(result.success).toBe(false)
  })

  test("resolvePlanCap falls back to MAX_PLAN_FILE_BYTES when unset", () => {
    //#given
    const config = MatrixxConfigSchema.parse({})

    //#when
    const cap = resolvePlanCap(config)

    //#then
    expect(cap).toBe(MAX_PLAN_FILE_BYTES)
    expect(cap).toBe(102_400)
  })

  test("resolvePlanCap honors configured value", () => {
    //#given
    const config = MatrixxConfigSchema.parse({ plans: { max_plan_file_bytes: 204_800 } })

    //#when
    const cap = resolvePlanCap(config)

    //#then
    expect(cap).toBe(204_800)
  })
})
