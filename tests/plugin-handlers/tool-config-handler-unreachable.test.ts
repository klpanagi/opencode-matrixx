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

/** Agent keys the handler looks up, in source order. */
const AGENT_KEYS = ["operator", "trinity", "construct", "architect", "morpheus", "keymaker", "oracle", "mouse"] as const

/** Agents that receive a task-system arm and therefore must deny both todo tools. */
const TODO_DENY_AGENTS = ["architect", "morpheus", "keymaker", "oracle", "mouse"] as const

/** Agents whose permission block is scoped to other tools only (never a todo allow). */
const SCOPED_AGENTS = ["operator", "trinity", "construct"] as const

function run(pluginConfig: unknown, seedTools?: Record<string, unknown>) {
  const config: Record<string, unknown> = seedTools ? { tools: { ...seedTools } } : { tools: {} }
  const agentResult: Record<string, unknown> = Object.fromEntries(AGENT_KEYS.map((key) => [key, {}]))
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

  test("the user override loses for tasks.enabled true, false and absent", () => {
    //#given a hand-set user override under every task-system configuration
    const userTools = { todowrite: true, todoread: true }
    const enabled = run({ tasks: { enabled: true } }, userTools)
    const disabled = run({ tasks: { enabled: false } }, userTools)
    const absent = run({}, userTools)

    //#when applyToolConfig spreads the plugin tools after the user's

    //#then the user's enable flag is overwritten in all three cases
    for (const result of [enabled, disabled, absent]) {
      expect(result.tools.todowrite).toBe(false)
      expect(result.tools.todoread).toBe(false)
    }
  })
})

describe("every agent arm denies the todo tools", () => {
  test("the source file looks up exactly the agents the test enumerates", () => {
    //#given the handler source
    const source = fs.readFileSync(HANDLER, "utf-8")

    //#then the agent keys found in the source match the literal list
    const found = [...source.matchAll(/agentByKey\(params\.agentResult,\s*"([^"]+)"\)/g)].map((m) => m[1])
    expect(found.sort()).toEqual([...AGENT_KEYS].sort())
  })

  test("each todo-arm agent denies todowrite and todoread", () => {
    //#given the full agent set
    const { agentResult } = run({ tasks: { enabled: true, scope: "project" } })

    //#then every todo-arm agent carries an explicit deny for both keys
    for (const name of TODO_DENY_AGENTS) {
      const permission = (agentResult[name] as { permission?: Record<string, TodoPermission> }).permission ?? {}
      expect(permission.todowrite).toBe("deny")
      expect(permission.todoread).toBe("deny")
    }
  })

  test("no other agent arm introduces a todo permission", () => {
    //#given the remaining agent arms, whose permissions are scoped to other tools
    const { agentResult } = run({ tasks: { enabled: true, scope: "project" } })

    //#then none of them mentions a todo key at all
    for (const name of SCOPED_AGENTS) {
      const permission = (agentResult[name] as { permission?: Record<string, TodoPermission> }).permission ?? {}
      expect(permission.todowrite).toBeUndefined()
      expect(permission.todoread).toBeUndefined()
    }
  })

  test("the todo-arm and scoped sets together cover every agent key", () => {
    //#given the two disjoint agent groups

    //#then their union is the complete agent set, with no gap and no overlap
    const union = new Set([...TODO_DENY_AGENTS, ...SCOPED_AGENTS])
    expect(union.size).toBe(AGENT_KEYS.length)
    for (const name of AGENT_KEYS) {
      expect(union.has(name)).toBe(true)
    }
  })
})
