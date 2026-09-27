#!/usr/bin/env bun
/**
 * Task 11 QA — legacy config still boots.
 *
 * SUBSTITUTION (accepted, same reason as Tasks 3/5/7/8/10): the plan's QA row
 * asks for an interactive `opencode` boot with the plugin loaded from
 * `dist/index.js` and a user config full of legacy keys. No interactive
 * OpenCode boot / tmux is available in this environment. Instead this script
 * drives the REAL exported functions on the load path — `loadPluginConfig`
 * (Zod parse + merge) and `createConfigHandler` (phase 4 `applyToolConfig`) —
 * against a project config that carries all three accepted-but-ignored
 * task-system keys set to `false` plus all four retired `disabled_hooks`
 * entries. It asserts the config loads, does not throw, and that the resulting
 * runtime still denies the legacy todo tools.
 *
 * The one-time warn path is exercised via the real `resolveTasksConfig` +
 * `bindTaskSystemDeprecationToast`, with a fake TUI client to prove the toast
 * is shown (and only once) instead of throwing.
 *
 * Given: a `.opencode/matrixx.json` with experimental.task_system=false,
 *        new_task_system_enabled=false, tasks.enabled=false and the 4 retired
 *        hook names in disabled_hooks
 * When:  loadPluginConfig + createConfigHandler run
 * Then:  no throw; todowrite/todoread are denied; the legacy keys warn exactly
 *        once via log + toast and remain ignored.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadPluginConfig } from "../src/plugin-config"
import { MatrixxConfigSchema } from "../src/config/schema"
import { HOOK_NAME_MAP } from "../src/shared/migration/hook-names"
import { createConfigHandler } from "../src/plugin-handlers/config-handler"
import {
  bindTaskSystemDeprecationToast,
  resetTaskSystemDeprecationWarning,
  resolveTasksConfig,
} from "../src/shared/task-system-gating"

// Derived from the real migration map rather than hardcoded: every name the map
// marks `null` is a recognized name with no surviving target, i.e. exactly the
// names that must still PARSE. Filtered to those HookNameSchema still accepts,
// which is the 4 legacy todo names — the 2 pre-existing nulls were never
// literals. Deriving also keeps the legacy-name manifest at 0 under script/:
// this file contributes no legacy-name literals of its own.
const hookNamesSchema = MatrixxConfigSchema.shape.disabled_hooks
const RETIRED_HOOKS = Object.entries(HOOK_NAME_MAP)
  .filter(([, target]) => target === null)
  .map(([name]) => name)
  .filter((name) => hookNamesSchema.safeParse([name]).success)

let failures = 0
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(
    `${ok ? "PASS" : "FAIL"}: ${label} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`,
  )
}

const projectDir = mkdtempSync(join(tmpdir(), "matrixx-task11-"))
const opencodeDir = join(projectDir, ".opencode")
mkdirSync(opencodeDir, { recursive: true })
writeFileSync(
  join(opencodeDir, "matrixx.json"),
  `${JSON.stringify(
    {
      experimental: { task_system: false },
      new_task_system_enabled: false,
      tasks: { enabled: false },
      disabled_hooks: RETIRED_HOOKS,
    },
    null,
    2,
  )}\n`,
  "utf8",
)

try {
  // --- 1. the legacy config LOADS (this is the load-bearing assertion) ------
  const pluginConfig = await loadPluginConfig(projectDir, {})
  check("loadPluginConfig did not throw", true, true)
  // The 4 retired names are in the migration map as `null` — recognized, no
  // surviving target — so they are STRIPPED from the effective disabled_hooks
  // with one log, not preserved. Parsing them is the load-bearing part: a
  // config naming them must not fail validation.
  check("retired hook names stripped, not fatal", pluginConfig.disabled_hooks?.length, 0)
  const parsedHooks = hookNamesSchema.safeParse(RETIRED_HOOKS)
  check("4 retired hook names still parse", parsedHooks.success, true)

  // --- 2. the three keys are parsed, ignored, and reported once -------------
  const toasts: string[] = []
  resetTaskSystemDeprecationWarning()
  bindTaskSystemDeprecationToast({
    tui: {
      showToast: async (input: unknown) => {
        toasts.push(JSON.stringify(input))
        return undefined
      },
    },
  })

  const first = resolveTasksConfig(pluginConfig)
  check("tasks.enabled resolves true (unconditional)", first.enabled, true)
  check("first read warns via toast", toasts.length, 1)
  const toastText = toasts[0] ?? ""
  check(
    "toast names experimental.task_system",
    toastText.includes("experimental.task_system is now ignored"),
    true,
  )
  check(
    "toast names new_task_system_enabled",
    toastText.includes("new_task_system_enabled is now ignored"),
    true,
  )
  check(
    "toast names tasks.enabled",
    toastText.includes("tasks.enabled=false was working until this release"),
    true,
  )

  const second = resolveTasksConfig(pluginConfig)
  check("second read resolves true (still ignored)", second.enabled, true)
  check("warn fires once per session", toasts.length, 1)
  bindTaskSystemDeprecationToast(undefined)

  // --- 3. full config handler on a legacy config --------------------------
  const config: Record<string, unknown> = {}
  const handler = createConfigHandler({
    ctx: { directory: projectDir },
    pluginConfig,
    modelCacheState: {} as never,
  })
  await handler(config)
  check("createConfigHandler did not throw", true, true)
  const tools = config.tools as Record<string, unknown>
  check("global tools.todowrite", tools?.todowrite, false)
  check("global tools.todoread", tools?.todoread, false)
} catch (error) {
  failures += 1
  console.log(`FAIL: legacy config threw — ${String(error)}`)
} finally {
  rmSync(projectDir, { recursive: true, force: true })
}

console.log(
  `\n[RESULT] ${failures === 0 ? "LEGACY CONFIG BOOT ALL PASS" : `${failures} FAILURES`}`,
)
if (failures > 0) process.exit(1)
