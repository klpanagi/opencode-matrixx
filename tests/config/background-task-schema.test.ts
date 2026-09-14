import { describe, expect, test } from "bun:test"
import { BackgroundTaskConfigSchema } from "../../src/config/schema/background-task"

describe("BackgroundTaskConfigSchema admission fields", () => {
  test("accepts admissionTimeoutMs: 0 (unbounded)", () => {
    //#given
    const config = { admissionTimeoutMs: 0 }

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.admissionTimeoutMs).toBe(0)
    }
  })

  test("rejects admissionTimeoutMs between 1 and 59999", () => {
    //#given
    const config = { admissionTimeoutMs: 59999 }

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })

  test("accepts admissionTimeoutMs: 60000 (minimum bounded value)", () => {
    //#given
    const config = { admissionTimeoutMs: 60000 }

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.admissionTimeoutMs).toBe(60000)
    }
  })

  test("rejects nestedAdmission.maxDepth above 5", () => {
    //#given
    const config = { nestedAdmission: { maxDepth: 9 } }

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })

  test("accepts nestedAdmission with enabled, mode and maxDepth", () => {
    //#given
    const config = { nestedAdmission: { enabled: true, mode: "reserve" as const, maxDepth: 3 } }

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nestedAdmission).toEqual({ enabled: true, mode: "reserve", maxDepth: 3 })
    }
  })

  test("absents parse to undefined without throwing", () => {
    //#given
    const config = {}

    //#when
    const result = BackgroundTaskConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.admissionTimeoutMs).toBeUndefined()
      expect(result.data.nestedAdmission).toBeUndefined()
    }
  })
})
