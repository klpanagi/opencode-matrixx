/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { isTaskSystemEnabled, resolveTasksConfig, TASK_SYSTEM_DEFAULT } from "../../src/shared/task-system-gating"

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

describe("resolveTasksConfig", () => {
  test("defaults to enabled project scope with session scoping", () => {
    //#given
    //#when
    const resolved = resolveTasksConfig({})
    //#then
    expect(resolved).toEqual({
      enabled: true,
      scope: "project",
      storage_path: undefined,
      task_list_id: undefined,
      stale_after_hours: undefined,
      session_scoped: true,
      pollTimeoutMs: undefined,
    })
  })

  test("canonical tasks.* wins over all legacy keys", () => {
    //#given
    const config = {
      tasks: { enabled: false, scope: "global", session_scoped: false, stale_after_hours: 48, pollTimeoutMs: 120000 },
      experimental: { task_system: true },
      morpheus: { tasks: { scope: "project", session_scoped: true, stale_after_hours: 12 } },
      task: { pollTimeoutMs: 60000 },
    }
    //#when
    const resolved = resolveTasksConfig(config as never)
    //#then
    expect(resolved.enabled).toBe(false)
    expect(resolved.scope).toBe("global")
    expect(resolved.session_scoped).toBe(false)
    expect(resolved.stale_after_hours).toBe(48)
    expect(resolved.pollTimeoutMs).toBe(120000)
    expect(isTaskSystemEnabled(config as never)).toBe(false)
  })

  test("legacy keys fill gaps when tasks.* is unset", () => {
    //#given
    const config = {
      experimental: { task_system: false },
      morpheus: { tasks: { scope: "global", task_list_id: "team", stale_after_hours: 72, session_scoped: false } },
      task: { pollTimeoutMs: 300000 },
    }
    //#when
    const resolved = resolveTasksConfig(config as never)
    //#then
    expect(resolved.enabled).toBe(false)
    expect(resolved.scope).toBe("global")
    expect(resolved.task_list_id).toBe("team")
    expect(resolved.stale_after_hours).toBe(72)
    expect(resolved.session_scoped).toBe(false)
    expect(resolved.pollTimeoutMs).toBe(300000)
  })

  test("dead new_task_system_enabled acts as last-resort fallback", () => {
    //#given
    const config = { new_task_system_enabled: false }
    //#when
    //#then
    expect(resolveTasksConfig(config as never).enabled).toBe(false)
    expect(isTaskSystemEnabled(config as never)).toBe(false)
  })
})
