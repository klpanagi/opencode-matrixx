/// <reference types="bun-types" />

/**
 * Guardrail: the 4 legacy todo hook names must REMAIN parseable (Q2 / invariant I2).
 *
 * Removal of the legacy todo system (Task 6) deletes the hook *implementations*.
 * The hook *names* stay in `HookNameSchema` as deprecated union literals so an
 * existing user config carrying any of them in `disabled_hooks` keeps loading.
 * Each name is additionally registered in `HOOK_NAME_MAP` with a `null` target,
 * meaning "recognized, no surviving hook" → stripped from the effective list
 * with one warn.
 *
 * This file is RED by design until Task 2: today the 4 names are still members
 * of `HookNameEnum` (no `@deprecated` marker) and absent from `HOOK_NAME_MAP`.
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { HookNameSchema } from "../../src/config/schema/hooks"
import { HOOK_NAME_MAP, migrateHookNames } from "../../src/shared/migration/hook-names"

const SRC = path.join(import.meta.dir, "../../src")

const LEGACY_TODO_HOOK_NAMES = [
  "todo-continuation-enforcer",
  "compaction-todo-preserver",
  "tasks-todowrite-disabler",
  "task-notepad",
] as const

function readHooksSchemaSource(): string {
  return fs.readFileSync(path.join(SRC, "config/schema/hooks.ts"), "utf-8")
}

describe("legacy todo hook names remain parseable (I2 / Q2)", () => {
  test("all four legacy names parse, so a pre-removal config still loads", () => {
    //#given a config written before the legacy todo system was removed
    const legacy = [...LEGACY_TODO_HOOK_NAMES]

    //#when the hook-name schema parses them as a list
    const result = HookNameSchema.array().safeParse(legacy)

    //#then it succeeds — no invalid_enum, plugin must still load
    expect(result.success).toBe(true)
  })

  test("each legacy name parses individually", () => {
    //#given each legacy name in isolation
    for (const name of LEGACY_TODO_HOOK_NAMES) {
      //#when the schema parses it
      const result = HookNameSchema.safeParse(name)

      //#then it is accepted
      expect(result.success).toBe(true)
    }
  })

  test("surviving hook names still parse", () => {
    //#given the current enum
    const names = ["task-continuation-enforcer", "session-notification"]

    //#when the schema parses them
    const result = HookNameSchema.array().safeParse(names)

    //#then parsing succeeds
    expect(result.success).toBe(true)
  })
})

describe("legacy names are retained as deprecated literals, not enum members", () => {
  test("none of the 4 names is a live HookNameEnum member", () => {
    //#given the schema source
    const source = readHooksSchemaSource()
    const enumBlock = source.slice(0, source.indexOf("export const HookNameSchema"))

    //#then no legacy todo name lives inside the live enum
    for (const name of LEGACY_TODO_HOOK_NAMES) {
      expect(enumBlock).not.toContain(`"${name}"`)
    }
  })

  test("each legacy name carries a @deprecated marker in the union", () => {
    //#given the schema source
    const source = readHooksSchemaSource()

    //#then every retained name is preceded by an @deprecated doc comment
    for (const name of LEGACY_TODO_HOOK_NAMES) {
      const index = source.indexOf(`"${name}"`)
      expect(index).toBeGreaterThan(-1)
      const preceding = source.slice(Math.max(0, index - 400), index)
      expect(preceding).toContain("@deprecated")
    }
  })

  test("no runtime DEPRECATED_HOOK_NAMES filter is introduced (R3)", () => {
    //#given the whole src tree
    const offenders = fs
      .readdirSync(SRC, { recursive: true, encoding: "utf-8" })
      .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
      .filter((entry) =>
        fs.readFileSync(path.join(SRC, entry), "utf-8").includes("DEPRECATED_HOOK_NAMES"),
      )

    //#then nothing declares such a filter (it would be dead code)
    expect(offenders).toEqual([])
  })
})

describe("legacy names migrate to a null target (no surviving hook)", () => {
  test("HOOK_NAME_MAP maps each legacy name to null", () => {
    //#given the migration map
    const map: Record<string, string | null> = HOOK_NAME_MAP

    //#then each of the 4 is recognized with no rename target
    for (const name of LEGACY_TODO_HOOK_NAMES) {
      expect(Object.hasOwn(map, name)).toBe(true)
      expect(map[name]).toBeNull()
    }
  })

  test("migrateHookNames strips the 4 names and reports them removed", () => {
    //#given a disabled_hooks list written before the removal
    const hooks = [...LEGACY_TODO_HOOK_NAMES, "session-notification"]

    //#when the migration runs
    const result = migrateHookNames(hooks)

    //#then the 4 are stripped (no surviving target) and a surviving name is untouched
    expect(result.removed.sort()).toEqual([...LEGACY_TODO_HOOK_NAMES].sort())
    expect(result.migrated).toEqual(["session-notification"])
    expect(result.changed).toBe(true)
  })
})
