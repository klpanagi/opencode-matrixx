/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { isTaskSystemEnabled, TASK_SYSTEM_DEFAULT } from "./task-system-gating"

describe("isTaskSystemEnabled", () => {
  test("returns true when config is empty object", () => {
    //#given
    const config = {}
    //#when
    const result = isTaskSystemEnabled(config)
    //#then
    expect(result).toBe(true)
  })

  test("returns true when experimental is empty", () => {
    //#given
    const config = { experimental: {} }
    //#when
    const result = isTaskSystemEnabled(config as never)
    //#then
    expect(result).toBe(true)
  })

  test("returns false when task_system is explicitly false", () => {
    //#given
    const config = { experimental: { task_system: false } }
    //#when
    const result = isTaskSystemEnabled(config)
    //#then
    expect(result).toBe(false)
  })

  test("returns true when task_system is explicitly true", () => {
    //#given
    const config = { experimental: { task_system: true } }
    //#when
    const result = isTaskSystemEnabled(config)
    //#then
    expect(result).toBe(true)
  })

  test("returns true when config is undefined", () => {
    //#given
    const config = undefined
    //#when
    const result = isTaskSystemEnabled(config)
    //#then
    expect(result).toBe(true)
  })

  test("returns true when config is null", () => {
    //#given
    const config = null
    //#when
    const result = isTaskSystemEnabled(config as never)
    //#then
    expect(result).toBe(true)
  })

  test("TASK_SYSTEM_DEFAULT is true", () => {
    //#given
    //#when
    //#then
    expect(TASK_SYSTEM_DEFAULT).toBe(true)
  })
})
