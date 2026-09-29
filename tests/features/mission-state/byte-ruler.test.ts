/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../../src/features/mission-state/constants"

describe("measurePlanBytes", () => {
  test("counts 2 bytes for a single 2-byte character, not the 1 UTF-16 code unit", () => {
    //#given
    const content = "é"

    //#when
    const bytes = measurePlanBytes(content)

    //#then
    expect(bytes).toBe(2)
    expect(content.length).toBe(1)
  })

  test("counts a mixed 3-byte + 4-byte sequence as 7 bytes", () => {
    //#given
    const content = "→🎯"

    //#when
    const bytes = measurePlanBytes(content)

    //#then
    expect(bytes).toBe(7)
    expect(content.length).toBe(3)
  })

  test("returns 0 for an empty string", () => {
    //#given
    const content = ""

    //#when
    const bytes = measurePlanBytes(content)

    //#then
    expect(bytes).toBe(0)
  })

  test("returns ASCII code-unit count unchanged", () => {
    //#given
    const content = "# Plan\n\n- [ ] task one"

    //#when
    const bytes = measurePlanBytes(content)

    //#then
    expect(bytes).toBe(content.length)
  })
})

describe("MAX_PLAN_FILE_BYTES", () => {
  test("still evaluates to 102400 after the dedupe", () => {
    //#given
    const cap = MAX_PLAN_FILE_BYTES

    //#when
    const value = cap

    //#then
    expect(value).toBe(102400)
  })
})
