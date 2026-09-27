/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { TasksConfigSchema } from "../../../src/config/schema/tasks"
import { DEFAULT_BACKGROUND_STALE_AFTER_HOURS, DEFAULT_STALE_AFTER_HOURS, getBackgroundStaleAfterMs, getStaleAfterMs } from "../../../src/hooks/task-continuation-enforcer/staleness"
import { resolveTasksConfig } from "../../../src/shared/task-system-gating"

const HOUR_MS = 60 * 60 * 1000

describe("tasks staleness windows", () => {
  test("the enforcer window stays at 24h by default (D4 pin)", () => {
    //#given no config at all
    //#when
    const ms = getStaleAfterMs(undefined)
    //#then the D4 guardrail is intact
    expect(DEFAULT_STALE_AFTER_HOURS).toBe(24)
    expect(ms).toBe(24 * HOUR_MS)
  })

  test("the background gate window defaults to 2h", () => {
    //#given no config at all
    //#when
    const ms = getBackgroundStaleAfterMs(undefined)
    //#then a much shorter, separate window
    expect(DEFAULT_BACKGROUND_STALE_AFTER_HOURS).toBe(2)
    expect(ms).toBe(2 * HOUR_MS)
    expect(ms).toBe(7_200_000)
  })

  test("getBackgroundStaleAfterMs honors an explicit fractional value", () => {
    //#given a config with a half-hour background window
    const config = { tasks: { background_stale_after_hours: 0.5 } }
    //#when
    const ms = getBackgroundStaleAfterMs(config as never)
    //#then
    expect(ms).toBe(1_800_000)
  })

  test("the two windows are independent", () => {
    //#given only the background key is set
    const config = { tasks: { background_stale_after_hours: 0.5 } }
    //#when both windows resolve
    const background = getBackgroundStaleAfterMs(config as never)
    const enforcer = getStaleAfterMs(config as never)
    //#then the enforcer keeps its own default
    expect(background).toBe(1_800_000)
    expect(enforcer).toBe(24 * HOUR_MS)
  })

  test("stale_after_hours accepts quarter-hour granularity", () => {
    //#given a sub-hour enforcer window
    //#when it is validated
    const result = TasksConfigSchema.safeParse({ stale_after_hours: 0.25 })
    //#then
    expect(result.success).toBe(true)
  })

  test("stale_after_hours still rejects values below the quarter-hour floor", () => {
    //#given 6 minutes expressed in hours
    //#when it is validated
    const result = TasksConfigSchema.safeParse({ stale_after_hours: 0.1 })
    //#then
    expect(result.success).toBe(false)
  })

  test("background_stale_after_hours applies its own floor", () => {
    //#given a below-floor background window
    //#when it is validated
    const result = TasksConfigSchema.safeParse({ background_stale_after_hours: 0.1 })
    //#then
    expect(result.success).toBe(false)
  })

  test("background_stale_after_hours parses to 2 when omitted", () => {
    //#given a config that sets no staleness key
    //#when it is validated
    const result = TasksConfigSchema.safeParse({})
    //#then the schema default materializes
    expect(result.success).toBe(true)
    expect(result.data?.background_stale_after_hours).toBe(2)
  })

  test("an explicit undefined background window still resolves to 2h at the getter", () => {
    //#given a config whose background window is explicitly undefined
    const config = { tasks: { background_stale_after_hours: undefined } }
    //#when both the resolver and the getter are consulted
    const resolved = resolveTasksConfig(config as never)
    const ms = getBackgroundStaleAfterMs(config as never)
    //#then the gate still gets the 2h window, not NaN
    expect(resolved.background_stale_after_hours).toBe(2)
    expect(ms).toBe(2 * HOUR_MS)
  })

  test("both staleness keys accept fractional hours together", () => {
    //#given a fully fractional config
    //#when it is validated
    const result = TasksConfigSchema.safeParse({
      stale_after_hours: 0.5,
      background_stale_after_hours: 0.25,
    })
    //#then
    expect(result.success).toBe(true)
  })

  test("resolveTasksConfig resolves the background window from the canonical key only", () => {
    //#given only the canonical background key is set
    const config = { tasks: { background_stale_after_hours: 0.5 } }
    //#when
    const resolved = resolveTasksConfig(config as never)
    //#then
    expect(resolved.background_stale_after_hours).toBe(0.5)
  })

  test("the legacy section cannot move the new background key", () => {
    //#given a legacy tasks section that only knows the old key
    const config = { morpheus: { tasks: { stale_after_hours: 0.5 } } }
    //#when
    const resolved = resolveTasksConfig(config as never)
    //#then the new key falls back to its default
    expect(resolved.stale_after_hours).toBe(0.5)
    expect(resolved.background_stale_after_hours).toBe(2)
  })

  test("pre-existing integer fixtures still parse unchanged", () => {
    //#given the integer hour values shipped before the widening
    //#when each is validated
    const parsed = [12, 24, 48, 72].map((h) => TasksConfigSchema.safeParse({ stale_after_hours: h }))
    //#then
    expect(parsed.every((r) => r.success)).toBe(true)
  })
})
