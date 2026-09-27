/// <reference types="bun-types" />

/**
 * Removal fence: every OpenCode `session.todo()` read is GONE from `src/`.
 *
 * This file replaces `session-todo-status-stub.test.ts`, which demanded the
 * opposite (that the real read be retained for one release). The task system is
 * now file-backed, so a per-session todo read can only ever disagree with the
 * authoritative store. Each of the nine assertions below is its own test so a
 * failure names the exact site that regressed.
 *
 * Assertions 7-9 deliberately PIN config compatibility that must survive:
 *   - the 4 deprecated hook-name literals, so existing user configs still load,
 *   - their `null` mappings in `HOOK_NAME_MAP`, which strip them with one warn,
 *   - the tool deny map, which is what actually keeps the legacy tools unused.
 *
 * CI note: NOT in `script/mock-heavy-list.txt` → plain catch-all → **no
 * `mock.module()`**. It only reads source text and imports the config barrel.
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import { HookNameSchema } from "../../src/config/schema/hooks"
import { HOOK_NAME_MAP } from "../../src/shared/migration/hook-names"

const SRC = path.join(import.meta.dir, "../../src")
const LEGACY_HOOK_NAMES = [
  "todo-continuation-enforcer",
  "compaction-todo-preserver",
  "tasks-todowrite-disabler",
  "task-notepad",
] as const

function readSrc(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf-8")
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFilesUnder(full))
    else if (entry.name.endsWith(".ts")) out.push(full)
  }
  return out
}

describe("the todo-read modules are gone", () => {
  test("1. the session-todo-status probe file no longer exists", () => {
    //#given the source tree
    const probe = path.join(SRC, "hooks/session-todo-status.ts")

    //#when the file is looked up
    const exists = fs.existsSync(probe)

    //#then it is absent
    expect(exists).toBe(false)
  })

  test("2. the hooks barrel no longer re-exports hasIncompleteTodos", () => {
    //#given the hooks barrel
    const barrel = readSrc("hooks/index.ts")

    //#when the export name is searched for
    const hits = barrel.includes("hasIncompleteTodos")

    //#then it is not present
    expect(hits).toBe(false)
  })

  test("3. no source file under src/ contains a session.todo( call", () => {
    //#given every TypeScript source file under src/
    const files = sourceFilesUnder(SRC)

    //#when each is scanned for the read
    const offenders = files.filter((file) =>
      fs.readFileSync(file, "utf-8").includes("session.todo("),
    )

    //#then the read is gone everywhere, including session-manager storage
    expect(offenders).toEqual([])
    expect(fs.readFileSync(path.join(SRC, "tools/session-manager/storage.ts"), "utf-8")).not.toContain(
      "session.todo(",
    )
  })
})

describe("each former call site is clean", () => {
  test("4. the background-agent manager has neither the predicate nor the read", () => {
    //#given the manager source
    const source = readSrc("features/background-agent/manager.ts")

    //#when the removed symbols are searched for
    const hasPredicate = source.includes("checkSessionTodos")
    const hasRead = source.includes("client.session.todo(")

    //#then neither survives
    expect(hasPredicate).toBe(false)
    expect(hasRead).toBe(false)
  })

  test("5. the background-agent reconciler has no session.todo( read", () => {
    //#given the reconciler source
    const source = readSrc("features/background-agent/reconcile.ts")

    //#when the read is searched for
    const hasRead = source.includes("session.todo(")

    //#then it is absent
    expect(hasRead).toBe(false)
  })

  test("6. the plan-persister hook has no session.todo( fallback", () => {
    //#given the plan-persister hook source
    const source = readSrc("hooks/plan-persister/hook.ts")

    //#when the read is searched for
    const hasRead = source.includes("session.todo(")

    //#then it is absent
    expect(hasRead).toBe(false)
  })
})

describe("config compatibility is preserved (pinned on purpose)", () => {
  test("7. the 4 deprecated hook names still parse as valid config", () => {
    //#given the 4 retained legacy hook names
    const names = [...LEGACY_HOOK_NAMES]

    //#when they are validated against the hook-name schema
    const result = HookNameSchema.array().safeParse(names)

    //#then existing user configs referencing them keep loading
    expect(result.success).toBe(true)
  })

  test("8. all 4 legacy names map to null in HOOK_NAME_MAP", () => {
    //#given HOOK_NAME_MAP
    const mappings = LEGACY_HOOK_NAMES.map((name) => [name, HOOK_NAME_MAP[name]] as const)

    //#when each legacy name is resolved
    //#then every one is recognized with no surviving target
    expect(mappings).toEqual([
      ["todo-continuation-enforcer", null],
      ["compaction-todo-preserver", null],
      ["tasks-todowrite-disabler", null],
      ["task-notepad", null],
    ])
  })

  test("9. the tool-config deny map still hides both legacy todo tools", () => {
    //#given the tool config handler source
    const source = readSrc("plugin-handlers/tool-config-handler.ts")

    //#when the deny mechanism is inspected
    //#then the shared deny map and both global tool entries survive
    expect(source).toContain("denyTodoTools")
    expect(source).toContain("todowrite: false")
    expect(source).toContain("todoread: false")
  })
})
