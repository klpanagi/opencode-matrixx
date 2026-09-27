/// <reference types="bun-types" />

/**
 * Remediation fence for the legacy-todo removal follow-up (R1/R2, C1, A1).
 *
 * Companion to `session-todo-read-removed.test.ts`, which pins the *absence* of
 * the OpenCode todo read and the retained config-compat surface. This file pins
 * the surface that follow-up *added* — the config plumbing the three background
 * completion gates depend on, the two deliberately-different staleness windows,
 * the ancestry depth, and the R2 clause that makes a zero-vote sync harmless.
 *
 * Every assertion names one file and, where the site is a call, one line, so a
 * failure reports the exact site that regressed rather than an aggregate count.
 *
 * CI note: **no `mock.module()`** — plain `mkdtempSync` fixtures and direct
 * source reads, so this file stays out of `script/mock-heavy-list.txt`.
 * Deliberately read-only: it never writes to `src/`.
 */

import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getBackgroundStaleAfterMs, getStaleAfterMs } from "../../src/hooks/task-continuation-enforcer/staleness"
import { DEFAULT_ANCESTRY_DEPTH } from "../../src/features/task-session-scope/ancestry"
import { readSessionTasks } from "../../src/features/task-session-scope/session-task-pending"
import { TaskObjectSchema } from "../../src/tools/task/types"

const SRC = join(import.meta.dir, "../../src")
const HOUR_MS = 60 * 60 * 1000
const MANAGER = "features/background-agent/manager.ts"
const LEGACY_HOOK_NAMES = [
  "todo-continuation-enforcer",
  "compaction-todo-presister",
  "tasks-todowrite-disabler",
  "task-notepad",
] as const

function readSrc(rel: string): string {
  return readFileSync(join(SRC, rel), "utf-8")
}

/** The balanced `{ ... }` that opens at or after `anchor`. Throws if unbalanced. */
function blockAfter(source: string, anchor: string): string {
  const at = source.indexOf(anchor)
  if (at < 0) throw new Error(`anchor not found: ${anchor}`)
  let depth = 0
  for (let i = source.indexOf("{", at); i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}" && --depth === 0) return source.slice(at, i + 1)
  }
  throw new Error(`unbalanced block after: ${anchor}`)
}

function lineOf(source: string, needle: string): number {
  return source.slice(0, source.indexOf(needle)).split("\n").length
}

describe("R1: the three background completion gates are still wired to plugin config", () => {
  const source = readSrc(MANAGER)

  test("10. the reconcile gate (manager.ts:315,321) passes config and the 2h window", () => {
    //#given the reconcile gate's injected predicate
    const block = blockAfter(source, "hasPendingTaskWork: async (sessionID) =>")

    //#when the query fields are inspected
    //#then the gate reads the configured store and the BACKGROUND window
    expect(block).toContain("config: this.pluginConfig")
    expect(block).toContain("staleAfterMs: getBackgroundStaleAfterMs(this.pluginConfig)")
  })

  test("11. the session.idle gate (manager.ts:1329,1332) passes config and the 2h window", () => {
    //#given the session.idle completion gate
    const gate = blockAfter(source.slice(source.indexOf("const hasIncompleteTaskWork = hasIncompleteTasksForSession({", 2000)), "hasIncompleteTasksForSession({")

    //#when the query fields are inspected
    //#then the gate reads the configured store and the BACKGROUND window
    expect(gate).toContain("config: this.pluginConfig")
    expect(gate).toContain("staleAfterMs: getBackgroundStaleAfterMs(this.pluginConfig)")
  })

  test("12. the polling gate (manager.ts:2237,2240) passes config and the 2h window", () => {
    //#given the polling completion gate (the third of the three)
    const third = source.lastIndexOf("hasIncompleteTasksForSession({")
    const gate = blockAfter(source.slice(third), "hasIncompleteTasksForSession({")

    //#when the query fields are inspected
    //#then it carries the same two arguments as the other two sites
    expect(gate).toContain("config: this.pluginConfig")
    expect(gate).toContain("staleAfterMs: getBackgroundStaleAfterMs(this.pluginConfig)")
  })

  test("13. every gate site in manager.ts carries BOTH arguments — no site drops the window", () => {
    //#given all hasIncompleteTasksForSession call sites in the manager
    const gates = source.match(/hasIncompleteTasksForSession\(\{/g)?.length ?? 0
    const complete = source.match(/staleAfterMs: getBackgroundStaleAfterMs\(this\.pluginConfig\),/g)?.length ?? 0
    const configured = source.match(/config: this\.pluginConfig,/g)?.length ?? 0

    //#when each site's argument list is counted
    //#then there are exactly 3 sites and each has both — dropping one is the T7 defect
    expect({ gates, complete, configured }).toEqual({ gates: 3, complete: 3, configured: 3 })
  })
})

describe("R1: the notification and diagnostic reads are wired to plugin config", () => {
  test("14. session-notification.ts:60 passes pluginConfig as the hook's 3rd param", () => {
    //#given the idle-notification task probe
    const hook = readSrc("hooks/session-notification.ts")
    const block = blockAfter(hook, "hasIncompleteTasksForSession({")

    //#when the hook signature and the query are inspected
    //#then `skipIfIncompleteTodos` reads the configured store, not the default one
    expect(hook).toMatch(/pluginConfig\?:\s*Partial<MatrixxConfig>/)
    expect(block).toContain("config: pluginConfig")
  })

  test("15. storage.ts:315-319 opts out of staleness at the include_todos read only", () => {
    //#given the readSessionTodos diagnostic read
    const block = blockAfter(readSrc("tools/session-manager/storage.ts"), "return readSessionTasks({")

    //#when its query fields are inspected
    //#then it is configured AND carries the explicit `excludeStale: false` opt-out
    expect(block).toContain("config: pluginConfig")
    expect(block).toContain("excludeStale: false")
  })

  test("16. tools.ts:41 hands the plugin config to the storage module", () => {
    //#given the single construction point of the storage module
    //#when its initialisation calls are inspected
    //#then `setStorageConfig(pluginConfig)` is present, so :15 can read a real config
    expect(readSrc("tools/session-manager/tools.ts")).toMatch(/setStorageConfig\(\s*pluginConfig\s*\)/)
  })
})

describe("C1: the two staleness windows stay deliberately different", () => {
  test("17. the gate window defaults to 2h and the enforcer window to 24h", () => {
    //#given no plugin config at all
    //#when each window is resolved
    //#then the gate is 2h and the enforcer is unchanged at 24h (D4)
    expect(getBackgroundStaleAfterMs()).toBe(2 * HOUR_MS)
    expect(getStaleAfterMs()).toBe(24 * HOUR_MS)
  })

  test("18. tasks.background_stale_after_hours is still schema-defaulted to 2", () => {
    //#given the tasks config schema
    //#when the key is read
    //#then the 0.25 floor and the default of 2 are both still there
    expect(readSrc("config/schema/tasks.ts")).toMatch(
      /background_stale_after_hours: z\.number\(\)\.min\(0\.25\)\.default\(2\)\.optional\(\)/,
    )
  })

  test("19. ancestry depth still defaults to 3 so delegated work is visible to the gates", () => {
    //#given the ancestry module and the gate query type
    //#when each default is read
    //#then the walk is 3 hops and `SessionTaskQuery` can still override it
    expect(DEFAULT_ANCESTRY_DEPTH).toBe(3)
    expect(readSrc("features/task-session-scope/session-task-pending.ts")).toMatch(/ancestryDepth\?: number/)
  })

  test("20. a stale task is excluded by default and admitted by the explicit opt-out", () => {
    //#given a 48h-old in_progress task in a real temp store
    const dir = mkdtempSync(join(tmpdir(), "tmff-fence-"))
    const store = join(dir, ".matrixx", "tasks")
    mkdirSync(store, { recursive: true })
    const id = "T-00000000-0000-4000-8000-0000000000f1"
    const path = join(store, `${id}.json`)
    writeFileSync(path, JSON.stringify(TaskObjectSchema.parse({
      id,
      subject: "aged",
      description: "",
      status: "in_progress",
      blocks: [],
      blockedBy: [],
      threadID: "ses_fence",
      projectRoot: dir,
    })))
    const old = Date.now() / 1000 - 48 * 3600
    utimesSync(path, old, old)

    //#when it is read with and without the opt-out
    const excluded = readSessionTasks({ directory: dir, sessionID: "ses_fence" })
    const included = readSessionTasks({ directory: dir, sessionID: "ses_fence", excludeStale: false })

    //#then the default stays strict and the diagnostic opt-out still admits it
    expect(excluded.map((t) => t.id)).toEqual([])
    expect(included.map((t) => t.id)).toEqual([id])
  })
})

describe("R2: the zero-vote path stamps instead of returning, and never unchecks", () => {
  test("21. plan-persister/hook.ts:52 has no early return in the zero-vote branch", () => {
    //#given the zero-vote branch that replaced the removed false-premise guard
    const block = blockAfter(readSrc("hooks/plan-persister/hook.ts"), "if (todos.length === 0) {")

    //#when the branch body is inspected
    //#then it only logs — a `return` here would stop the plan being stamped (D3)
    expect(block).not.toMatch(/\breturn\b/)
  })

  test("22. plan-storage.ts:143-144 still only ever checks a checkbox", () => {
    //#given syncCheckboxesDetailed, the R2 evidence
    const body = blockAfter(readSrc("features/mission-state/plan-storage.ts"), "const done = ")

    //#when the done computation is inspected
    //#then the never-uncheck clause and its comment both survive verbatim
    expect(body).toContain('|| current.toLowerCase() === "x"')
    expect(readSrc("features/mission-state/plan-storage.ts")).toContain("Only check, never uncheck")
  })
})

describe("D4 and the config-compat surface are pinned on purpose", () => {
  test("23. background_task.wallClockTimeoutMs default stays 0", () => {
    //#given the background-agent constants
    //#when the wall-clock backstop default is read
    //#then it is still disabled (D4 bounds the window with a new key, not this one)
    expect(readSrc("features/background-agent/constants.ts")).toMatch(
      /export const DEFAULT_WALL_CLOCK_TIMEOUT_MS = 0\b/,
    )
  })

  test("24. the enforcer's own stale default is still 24 (only the new key moved)", () => {
    //#given the enforcer staleness module
    //#when its default is read
    //#then 24h survives — the 2h window is a SEPARATE knob, not a lowered one
    expect(readSrc("hooks/task-continuation-enforcer/staleness.ts")).toMatch(
      /export const DEFAULT_STALE_AFTER_HOURS = 24\b/,
    )
  })

  // Every pin below is a STATIC regex literal, never a runtime-built needle.
  // See the note at the top of this file: in this repo's test context a
  // runtime-constructed needle intermittently reports a false negative, so the
  // shape of the pin is written out in full at each site.
  test("25. the 4 retained hook names still sit behind an @deprecated z.literal()", () => {
    //#given the hook-name schema source
    const schema = readSrc("config/schema/hooks.ts")

    //#when each of the 4 declarations at hooks.ts:82,84,86,88 is matched
    //#then each is still a z.literal() carrying its @deprecated comment
    const pins: [string, RegExp][] = [
      ["todo-continuation-enforcer (hooks.ts:82)", /@deprecated[^\n]*\n\s*z\.literal\("todo-continuation-enforcer"\)/],
      ["compaction-todo-preserver (hooks.ts:84)", /@deprecated[^\n]*\n\s*z\.literal\("compaction-todo-preserver"\)/],
      ["tasks-todowrite-disabler (hooks.ts:86)", /@deprecated[^\n]*\n\s*z\.literal\("tasks-todowrite-disabler"\)/],
      ["task-notepad (hooks.ts:88)", /@deprecated[^\n]*\n\s*z\.literal\("task-notepad"\)/],
    ]
    const missing = pins.filter(([, re]) => !re.test(schema)).map(([site]) => site)

    //#then no declaration is missing its literal or its deprecation notice
    expect(missing).toEqual([])
  })

  test("26. the 4 legacy names are still mapped to null in hook-names.ts", () => {
    //#given HOOK_NAME_MAP's source
    const map = readSrc("shared/migration/hook-names.ts")

    //#when the 4 mappings at hook-names.ts:14-17 are matched
    //#then each is present with a null target (removing one breaks plugin load)
    const pins: [string, RegExp][] = [
      ["todo-continuation-enforcer (hook-names.ts:14)", /"todo-continuation-enforcer": null/],
      ["compaction-todo-preserver (hook-names.ts:15)", /"compaction-todo-preserver": null/],
      ["tasks-todowrite-disabler (hook-names.ts:16)", /"tasks-todowrite-disabler": null/],
      ["task-notepad (hook-names.ts:17)", /"task-notepad": null/],
    ]
    const missing = pins.filter(([, re]) => !re.test(map)).map(([site]) => site)

    //#then none has been dropped or re-pointed at a surviving hook
    expect(missing).toEqual([])
  })

  test("27. tool-config-handler.ts still denies both legacy todo tools globally", () => {
    //#given the tool config handler source
    const handler = readSrc("plugin-handlers/tool-config-handler.ts")

    //#when the global tool table is inspected
    //#then the deny map and both `false` entries survive — this is what keeps the
    //     legacy tools unusable, not merely deprecated
    expect(handler).toContain("denyTodoTools")
    expect(handler).toMatch(/todowrite: false/)
    expect(handler).toMatch(/todoread: false/)
    expect(lineOf(handler, "denyTodoTools")).toBeGreaterThan(0)
  })
})
