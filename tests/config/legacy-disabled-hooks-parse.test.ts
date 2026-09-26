/// <reference types="bun-types" />

/**
 * Behavioural proof for Task 2: a config written before the legacy todo system
 * was removed still LOADS (no `invalid_enum`), and after migration the effective
 * `disabled_hooks` no longer carries any of the 4 retired names.
 */

import { describe, expect, test } from "bun:test"
import { MatrixxConfigSchema } from "../../src/config/schema/matrixx-config"
import { migrateHookNames } from "../../src/shared/migration/hook-names"

const LEGACY_TODO_HOOK_NAMES = [
  "todo-continuation-enforcer",
  "compaction-todo-preserver",
  "tasks-todowrite-disabler",
  "task-notepad",
] as const

describe("a pre-removal config still loads", () => {
  test("all 4 legacy names in disabled_hooks pass full PluginConfig parsing", () => {
    //#given a config authored while the legacy todo system still existed
    const raw = {
      disabled_hooks: [...LEGACY_TODO_HOOK_NAMES],
      new_task_system_enabled: false,
      experimental: { task_system: false },
      disabled_tools: ["todowrite", "todoread"],
    }

    //#when the full root schema parses it
    const result = MatrixxConfigSchema.safeParse(raw)

    //#then it succeeds — no invalid_enum, and the no-op keys are still accepted
    expect(result.success).toBe(true)
    if (!result.success) {
      const codes = result.error.issues.map((i) => i.code)
      throw new Error(`expected no issues, got ${JSON.stringify(codes)}`)
    }
  })

  test("after migration the effective disabled_hooks carries none of them", () => {
    //#given the same legacy list plus one surviving hook
    const disabled = [...LEGACY_TODO_HOOK_NAMES, "session-notification"]

    //#when migrateHookNames runs (this is what sanitizeDisabledHooks calls)
    const result = migrateHookNames(disabled)

    //#then all 4 are stripped and only the surviving name remains
    expect(result.migrated).toEqual(["session-notification"])
    expect(result.removed.sort()).toEqual([...LEGACY_TODO_HOOK_NAMES].sort())
    for (const name of LEGACY_TODO_HOOK_NAMES) {
      expect(result.migrated).not.toContain(name)
    }
  })

  test("migrating is idempotent — a second pass changes nothing", () => {
    //#given an already-migrated list
    const once = migrateHookNames([...LEGACY_TODO_HOOK_NAMES]).migrated

    //#when it is migrated again
    const twice = migrateHookNames(once)

    //#then it is a fixed point
    expect(twice.changed).toBe(false)
    expect(twice.removed).toEqual([])
    expect(twice.migrated).toEqual(once)
  })
})
