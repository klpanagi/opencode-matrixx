/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createArchitectAgent } from "../../src/agents/architect/agent"
import { applyToolConfig } from "../../src/plugin-handlers/tool-config-handler"

describe("architect factory outgoing-task allow (issue #111 option b)", () => {
  test("factory does not deny outgoing task()", () => {
    //#given
    const ctx = {}

    //#when
    const result = createArchitectAgent(ctx) as unknown as {
      permission?: Record<string, unknown>
      mode?: string
    }

    //#then
    expect(result.permission?.["task"]).not.toBe("deny")
    expect(result.mode).toBe("primary")
  })
})

describe("architect handler fill-only semantics (issue #111 option b)", () => {
  test("taskSystem=true fills outgoing allow without overwriting", () => {
    //#given
    const agentResult: Record<string, unknown> = { architect: { permission: {} } }

    //#when
    applyToolConfig({ config: {}, pluginConfig: { tasks: { enabled: true } }, agentResult })

    //#then
    const permission = (agentResult["architect"] as { permission: Record<string, unknown> }).permission
    expect(permission["task"]).toBe("allow")
    expect(permission["task_*"]).toBe("allow")
    expect(permission["teammate"]).toBe("allow")
  })

  test("taskSystem=false keeps legacy todos path", () => {
    //#given
    const agentResult: Record<string, unknown> = { architect: { permission: {} } }

    //#when
    applyToolConfig({ config: {}, pluginConfig: { tasks: { enabled: false } }, agentResult })

    //#then
    const permission = (agentResult["architect"] as { permission: Record<string, unknown> }).permission
    expect(permission["todowrite"]).toBe("allow")
    expect(permission["todoread"]).toBe("allow")
  })

  test("fill-only preserves explicit factory deny (user override wins)", () => {
    //#given
    const agentResult: Record<string, unknown> = { architect: { permission: { task: "deny" } } }

    //#when
    applyToolConfig({ config: {}, pluginConfig: { tasks: { enabled: true } }, agentResult })

    //#then
    const permission = (agentResult["architect"] as { permission: Record<string, unknown> }).permission
    expect(permission["task"]).toBe("deny")
  })
})
