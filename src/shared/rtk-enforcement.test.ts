/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { resolveRtkEnforcement } from "./rtk-enforcement"

const PRESENT = () => "/usr/bin/rtk"
const ABSENT = () => null

describe("resolveRtkEnforcement truth table", () => {
  test("row 1: disabled config is inactive regardless of binary and hook", () => {
    //#given
    const rtk = { enabled: false, timeout_ms: 5000 } as never

    //#when
    const result = resolveRtkEnforcement(rtk, { which: PRESENT, hookEnabled: true })

    //#then
    expect(result.active).toBe(false)
    expect(result.enabled).toBe(false)
    expect(result.binaryPresent).toBe(true)
  })

  test("row 2: enabled but binary missing is inactive", () => {
    //#given
    const rtk = { enabled: true, timeout_ms: 5000 } as never

    //#when
    const result = resolveRtkEnforcement(rtk, { which: ABSENT, hookEnabled: true })

    //#then
    expect(result.active).toBe(false)
    expect(result.binaryPresent).toBe(false)
  })

  test("row 3: enabled and binary present but hook disabled is inactive", () => {
    //#given
    const rtk = { enabled: true, timeout_ms: 5000 } as never

    //#when
    const result = resolveRtkEnforcement(rtk, { which: PRESENT, hookEnabled: false })

    //#then
    expect(result.active).toBe(false)
    expect(result.binaryPresent).toBe(true)
  })

  test("row 4: enabled, binary present, hook enabled is active", () => {
    //#given
    const rtk = { enabled: true, timeout_ms: 5000 } as never

    //#when
    const result = resolveRtkEnforcement(rtk, { which: PRESENT, hookEnabled: true })

    //#then
    expect(result.active).toBe(true)
    expect(result.enabled).toBe(true)
    expect(result.binaryPresent).toBe(true)
    expect(result.binaryPath).toBe("rtk")
  })

  test("row 5: missing rtk config is inactive (opt-out)", () => {
    //#given
    const rtk = undefined

    //#when
    const result = resolveRtkEnforcement(rtk, { which: PRESENT, hookEnabled: true })

    //#then
    expect(result.active).toBe(false)
    expect(result.enabled).toBe(false)
  })

  test("respects custom binary_path in the probe", () => {
    //#given
    const seen: string[] = []
    const rtk = { enabled: true, timeout_ms: 5000, binary_path: "/opt/rtk/bin/rtk" } as never

    //#when
    const result = resolveRtkEnforcement(rtk, {
      which: (bin) => {
        seen.push(bin)
        return "/opt/rtk/bin/rtk"
      },
      hookEnabled: true,
    })

    //#then
    expect(seen).toEqual(["/opt/rtk/bin/rtk"])
    expect(result.binaryPath).toBe("/opt/rtk/bin/rtk")
    expect(result.active).toBe(true)
  })
})
