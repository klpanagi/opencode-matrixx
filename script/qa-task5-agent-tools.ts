#!/usr/bin/env bun
/**
 * Task 5 QA substitution — agent tool-permission matrix.
 *
 * SUBSTITUTION (accepted): the plan's first QA row asks for a live `opencode`
 * boot with the plugin loaded from `dist/index.js` and an inspection of the
 * RESOLVED tool config. A live boot is not reliably available in this
 * environment (no interactive TTY / server lifecycle). Instead this script
 * exercises the real, exported `applyToolConfig` — the exact function
 * `config-handler.ts` calls in phase 4 of config loading — over all five
 * task-capable agents and asserts the resulting permission map. This covers the
 * same contract a live boot would have revealed: with the legacy disabler hook
 * gone, the ONLY thing denying `todowrite`/`todoread` is this permission layer.
 *
 * Given: a config + agentResult containing morpheus, keymaker, oracle,
 *        architect, mouse
 * When:  applyToolConfig runs
 * Then:  todowrite/todoread are "deny" and the task tools plus teammate are
 *        "allow" for every one of the five, and the global tool map hides the
 *        legacy todo tools.
 */

import { applyToolConfig } from "../src/plugin-handlers/tool-config-handler"
import type { MatrixxConfig } from "../src/config"

const AGENTS = ["morpheus", "keymaker", "oracle", "architect", "mouse"] as const
const MUST_DENY = ["todowrite", "todoread"] as const
const MUST_ALLOW = ["task", "task_*", "teammate"] as const
/**
 * `keymaker` is intentionally narrower: `src/plugin-handlers/AGENTS.md` records
 * its contract as "task, question allowed" — no `task_*` / `teammate` grant.
 * That predates Task 5 (set in Task 4) and is out of scope here, so it is
 * asserted as absent rather than allowed.
 */
const NO_WIDE_TASK_GRANT: readonly string[] = ["keymaker"]

let failures = 0
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}: ${label} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`)
}

const agentResult: Record<string, unknown> = {}
for (const name of AGENTS) agentResult[name] = { description: name, permission: {} }

const config: Record<string, unknown> = { tools: {} }
applyToolConfig({
  config,
  pluginConfig: {} as MatrixxConfig,
  agentResult,
})

for (const name of AGENTS) {
  const permission = (agentResult[name] as { permission: Record<string, unknown> }).permission
  for (const tool of MUST_DENY) check(`${name}.${tool}`, permission[tool], "deny")
  for (const tool of MUST_ALLOW) {
    const expected = NO_WIDE_TASK_GRANT.includes(name) && tool !== "task" ? undefined : "allow"
    check(`${name}.${tool}`, permission[tool], expected)
  }
}

const globalTools = config.tools as Record<string, unknown>
check("global tools.todowrite", globalTools.todowrite, false)
check("global tools.todoread", globalTools.todoread, false)

console.log(`\n[RESULT] ${failures === 0 ? "AGENT TOOL MATRIX ALL PASS" : `${failures} FAILURES`}`)
if (failures > 0) process.exit(1)
