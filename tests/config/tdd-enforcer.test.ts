/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { MatrixxConfigSchema, TddEnforcerConfigSchema } from "../../src/config/schema"

describe("tdd_enforcer default-true (fail-closed, issue #127)", () => {
  test("defaults to enabled:true when enabled key is omitted", () => {
    //#given
    const raw = {}

    //#when
    const result = TddEnforcerConfigSchema.parse(raw)

    //#then
    expect(result.enabled).toBe(true)
  })

  test("resolves enabled:true via MatrixxConfig when block is empty", () => {
    //#given
    const raw = { tdd_enforcer: {} }

    //#when
    const result = MatrixxConfigSchema.parse(raw)

    //#then
    expect(result.tdd_enforcer?.enabled).toBe(true)
  })

  test("explicit false opt-out is preserved (TddEnforcerConfigSchema)", () => {
    //#given
    const raw = { enabled: false }

    //#when
    const result = TddEnforcerConfigSchema.parse(raw)

    //#then
    expect(result.enabled).toBe(false)
  })

  test("explicit false opt-out is preserved (MatrixxConfigSchema)", () => {
    //#given
    const raw = { tdd_enforcer: { enabled: false } }

    //#when
    const result = MatrixxConfigSchema.parse(raw)

    //#then
    expect(result.tdd_enforcer?.enabled).toBe(false)
  })

  test("explicit true is preserved", () => {
    //#given
    const raw = { tdd_enforcer: { enabled: true } }

    //#when
    const result = MatrixxConfigSchema.parse(raw)

    //#then
    expect(result.tdd_enforcer?.enabled).toBe(true)
  })

  test("absent tdd_enforcer key resolves fail-closed to enabled", () => {
    //#given
    const raw = {}

    //#when
    const result = MatrixxConfigSchema.parse(raw)

    //#then
    expect(result.tdd_enforcer?.enabled ?? true).toBe(true)
  })
})
