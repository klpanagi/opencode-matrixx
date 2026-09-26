/// <reference types="bun-types" />

/**
 * Guardrail: `config.tools.todowrite` / `todoread` must be suppressed
 * UNCONDITIONALLY (invariant I1).
 *
 * Today `src/plugin-handlers/tool-config-handler.ts` wraps the global
 * `todowrite: false, todoread: false` in an `isTaskSystem` ternary, and every
 * per-agent branch has a `todowrite: "allow", todoread: "allow"` alternative.
 * Once the task system is unconditional (Tasks 3 + 4) that alternative is
 * unreachable — the guardrail below proves it by construction.
 *
 * This file is RED by design until Task 4.
 *
 * CI note: this file lives under `tests/plugin-handlers/`, which is a
 * **directory** entry in `script/mock-heavy-list.txt`, so it runs isolated and
 * `mock.module()` would be permitted. It is not needed — the handler is pure.
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import type { MatrixxConfig } from "../../src/config/schema"
import { applyToolConfig } from "../../src/plugin-handlers/tool-config-handler"

const SRC = path.join(import.meta.dir, "../../src")
const HANDLER = path.join(SRC, "plugin-handlers/tool-config-handler.ts")

type TodoPermission = "allow" | "deny" | true | false | undefined

function run(pluginConfig: unknown, seedTools?: Record<string, unknown>) {
  const config: Record<string, unknown> = seedTools ? { tools: { ...seedTools } } : { tools: {} }
  const agentResult: Record<string, unknown> = {
    architect: {},
    morpheus: {},
    oracle: {},
    mouse: {},
    keymaker: {},
    construct: {},
  }
  applyToolConfig({
    config,
    pluginConfig: pluginConfig as MatrixxConfig,
    agentResult,
  })
  return {
    tools: config.tools as Record<string, unknown>,
    agentResult,
  }
}

describe("todo tools are unconditionally suppressed (I1)", () => {
  test("tasks.enabled true, false and absent all yield todowrite/todoread === false", () => {
    //#given tasks.enabled true, false, and absent
    const enabled = run({ tasks: { enabled: true, scope: "project" } })
    const disabled = run({ tasks: { enabled: false, scope: "project" } })
    const absent = run({})

    //#then the tool map denies both todo tools in all three cases
    for (const result of [enabled, disabled, absent]) {
      expect(result.tools.todowrite).toBe(false)
      expect(result.tools.todoread).toBe(false)
    }
  })

  test("the resulting tool map is identical across all three cases", () => {
    //#given the same three configurations
    const enabled = run({ tasks: { enabled: true, scope: "project" } })
    const disabled = run({ tasks: { enabled: false, scope: "project" } })
    const absent = run({})

    //#then no branch can differ — the task-system key no longer reaches the handler
    expect(disabled.tools).toEqual(enabled.tools)
    expect(absent.tools).toEqual(enabled.tools)
  })
})

describe("no agent branch ever allows todo tools", () => {
  test("no per-agent permission map grants todowrite/todoread", () => {
    //#given the default agent set
    const { agentResult } = run({ tasks: { enabled: true, scope: "project" } })
    const offenders: string[] = []

    //#then every agent's todo permissions are "deny" (never "allow"/true)
    for (const [name, value] of Object.entries(agentResult)) {
      const permission = (value as { permission?: Record<string, TodoPermission> }).permission ?? {}
      for (const key of ["todowrite", "todoread"] as const) {
        const decision = permission[key]
        if (decision === "allow" || decision === true) {
          offenders.push(`${name}.${key}=${String(decision)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test("every agent branch that mentions todo tools uses deny", () => {
    //#given the handler source
    const source = fs.readFileSync(HANDLER, "utf-8")
    const matches = source.match(/todo(?:write|read)\s*:\s*"[^"]*"|todo(?:write|read)\s*:\s*(?:true|false)/g) ?? []

    //#then only false / "deny" appear
    for (const match of matches) {
      expect(match).toMatch(/:\s*false$|:\s*"deny"$/)
    }
  })
})

describe("plugin config wins over a hand-set user override", () => {
  test("a user tools.todowrite=true override does not survive", () => {
    //#given a user opencode.json with tools: { todowrite: true, todoread: true }
    const userTools = { todowrite: true, todoread: true }

    //#when applyToolConfig runs (plugin tools are spread after the user's)
    const { tools } = run({}, userTools)

    //#then the plugin value wins and the override is gone
    expect(tools.todowrite).toBe(false)
    expect(tools.todoread).toBe(false)
  })
})
