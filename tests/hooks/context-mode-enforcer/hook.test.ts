/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { MatrixxConfig } from "../../../src/config"
import { BLOCK_MESSAGE_GREP_GLOB } from "../../../src/hooks/context-mode-enforcer/constants"
import { createContextModeEnforcerHook } from "../../../src/hooks/context-mode-enforcer/hook"
import { _setDisciplinePathForTesting } from "../../../src/shared/context-mode-enforcement"

const FAKE_PATH = "/nonexistent-fake/AGENTS.md"

function makeConfig(contextMode: unknown): MatrixxConfig {
  return { context_mode: contextMode } as unknown as MatrixxConfig
}

function runHook(contextMode: unknown, tool: string, args: Record<string, unknown> = {}) {
  const hook = createContextModeEnforcerHook(makeConfig(contextMode))
  const output: { args: Record<string, unknown>; message?: string } = { args }
  const promise = hook["tool.execute.before"](
    { tool, sessionID: "ses_1" } as never,
    output as never,
  )
  return { promise, output }
}

describe("context-mode-enforcer hook", () => {
  test("block message names the working substitute", () => {
    //#given: the block message
    //#when: inspected
    //#then: points at ctx_batch_execute/ctx_execute + rg, never a grep/glob fallback
    expect(BLOCK_MESSAGE_GREP_GLOB).toContain("ctx_batch_execute")
    expect(BLOCK_MESSAGE_GREP_GLOB).toContain("ctx_execute")
    expect(BLOCK_MESSAGE_GREP_GLOB).toContain("rg")
    expect(BLOCK_MESSAGE_GREP_GLOB).not.toContain("grep/glob fallback")
  })

  test("blocks grep when enforced with a working substitute", async () => {
    //#given: enforce on, substitute taught
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise } = runHook({ enforce: true }, "grep")
    //#when: grep runs
    //#then: throws naming the substitute
    await expect(promise).rejects.toThrow("ctx_batch_execute")
  })

  test("warns instead of blocking when no substitute exists", async () => {
    //#given: enforce on, nothing indexed
    _setDisciplinePathForTesting(null)
    const { promise, output } = runHook({ enforce: true }, "grep")
    //#when: grep runs
    //#then: soft warning, no throw — the agent is never stranded
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeDefined()
  })

  test("warns on grep when enforce is off", async () => {
    //#given: warn-only mode
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise, output } = runHook({ enforce: false }, "grep")
    //#when: grep runs
    //#then: soft warning, no throw
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeDefined()
  })

  test("lets grep through when not in blocked_tools", async () => {
    //#given: grep not gated
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise, output } = runHook({ enforce: true, blocked_tools: ["glob"] }, "grep")
    //#when: grep runs
    //#then: untouched
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeUndefined()
  })

  test("read is warn-only even under enforce", async () => {
    //#given: read gated, enforce on
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise, output } = runHook({ enforce: true, blocked_tools: ["read", "grep"] }, "read")
    //#when: read runs
    //#then: warns, never throws
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeDefined()
  })

  test("bash grep warns when bash is not gated", async () => {
    //#given: enforce on, bash not in blocked_tools
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise, output } = runHook({ enforce: true }, "bash", { command: "grep -r foo src" })
    //#when: bash grep runs
    //#then: warns, never throws
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeDefined()
  })

  test("no-op when context_mode disabled", async () => {
    //#given: disabled
    _setDisciplinePathForTesting(FAKE_PATH)
    const { promise, output } = runHook({ enabled: false, enforce: true }, "grep")
    //#when: grep runs
    //#then: untouched
    await expect(promise).resolves.toBeUndefined()
    expect(output.message).toBeUndefined()
  })
})
