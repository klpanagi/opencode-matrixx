/// <reference types="bun-types" />

/**
 * Guardrail: the real `session.todo()` read in `src/hooks/session-todo-status.ts`
 * MUST BE RETAINED for one release (decision Q11).
 *
 * OpenCode's todo state is per-session and PERSISTS across the upgrade. A
 * `return false` stub would report "no incomplete todos" to a user whose list
 * is non-empty, flipping `session-notification` idle-suppression and the
 * background-agent gate in the WRONG direction on day one. So this file does
 * NOT demand a stub — it demands the opposite, plus explicit deprecation:
 *   1. the real read still happens (behavioral: one incomplete item → true),
 *   2. a one-time deprecation log is emitted,
 *   3. a comment names WHY the read is retained (tracking issue R2).
 *
 * RED by design until Task 5.
 *
 * CI note: NOT in `script/mock-heavy-list.txt` → plain `bun test` catch-all →
 * **no `mock.module()`**. `hasIncompleteTodos(ctx, sessionID)` takes its
 * dependency (`ctx`) as an argument, so a plain object literal with a
 * `session.todo()` stub is enough — nothing is mocked.
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { hasIncompleteTodos } from "../../src/hooks/session-todo-status"

const SRC = path.join(import.meta.dir, "../../src")
const PROBE_FILE = path.join(SRC, "hooks/session-todo-status.ts")
const MANAGER_FILE = path.join(SRC, "features/background-agent/manager.ts")

function ctxWithTodos(todos: { status: string; content: string }[]): {
  ctx: PluginInput
  calls: () => number
} {
  let callCount = 0
  const ctx = {
    directory: import.meta.dir,
    client: {
      session: {
        todo: async () => {
          callCount += 1
          return {
            data: todos.map((todo, index) => ({
              id: `todo-${index}`,
              content: todo.content,
              status: todo.status,
              priority: "high",
            })),
          }
        },
      },
    },
  } as unknown as PluginInput
  return { ctx, calls: () => callCount }
}

describe("the real todo read is retained (Q11)", () => {
  test("one incomplete item still yields true — not a `return false` stub", async () => {
    //#given a session opened before the upgrade that still holds a non-empty list
    const { ctx } = ctxWithTodos([{ status: "pending", content: "finish the migration" }])

    //#when hasIncompleteTodos runs
    const result = await hasIncompleteTodos(ctx, "ses_pre_upgrade")

    //#then the incomplete item is honoured
    expect(result).toBe(true)
  })

  test("the probe actually calls session.todo() instead of short-circuiting", async () => {
    //#given a session whose todo list is entirely completed
    const { ctx, calls } = ctxWithTodos([{ status: "completed", content: "already done" }])

    //#when hasIncompleteTodos runs
    const result = await hasIncompleteTodos(ctx, "ses_completed")

    //#then the read happened exactly once and correctly reported no incomplete todos
    expect(calls()).toBe(1)
    expect(result).toBe(false)
  })

  test("an empty list is false without any special-cased branch", async () => {
    //#given a session with no todos
    const { ctx, calls } = ctxWithTodos([])

    //#when hasIncompleteTodos runs
    const result = await hasIncompleteTodos(ctx, "ses_empty")

    //#then it still performed the real read and returned false
    expect(calls()).toBe(1)
    expect(result).toBe(false)
  })
})

describe("the retained read is explicitly deprecated", () => {
  test("a one-time deprecation log is emitted by the probe", () => {
    //#given the probe source
    const source = fs.readFileSync(PROBE_FILE, "utf-8")

    //#then it logs a deprecation notice (one-time guard included)
    expect(source).toContain("logger")
    expect(source).toMatch(/deprecat/i)
    expect(source).toMatch(/log(?:ged)?Once|deprecat\w*Logged|hasLogged/i)
  })

  test("a comment names WHY the real read is retained", () => {
    //#given the probe source
    const source = fs.readFileSync(PROBE_FILE, "utf-8")
    const comments = source
      .split("\n")
      .filter((line) => /^\s*(\/\/|\/\*|\*)/.test(line))
      .join("\n")

    //#then the retention rationale and the tracking issue are documented
    expect(comments).toMatch(/session\.todo\(\)/)
    expect(comments).toMatch(/retain|persist|per-session/i)
    expect(comments).toMatch(/R2|issue/i)
  })

  test("the background-agent probe checkSessionTodos also keeps the real read", () => {
    //#given the background-agent manager source
    const source = fs.readFileSync(MANAGER_FILE, "utf-8")

    //#then its own probe still performs the real read instead of returning false
    expect(source).toContain("checkSessionTodos")
    expect(source).toMatch(/checkSessionTodos[\s\S]{0,200}client\.session\.todo\(/)
  })
})
