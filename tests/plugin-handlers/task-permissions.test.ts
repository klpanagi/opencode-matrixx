/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createArchitectAgent } from "../../src/agents/architect"
import { createBddContractAgent } from "../../src/agents/bdd-contract"
import { createCipherAgent } from "../../src/agents/cipher"
import { createKeymakerAgent } from "../../src/agents/keymaker"
import { createMouseAgentWithOverrides } from "../../src/agents/mouse/agent"
import { createMorpheusAgent } from "../../src/agents/morpheus"
import { createSentinelAgent } from "../../src/agents/sentinel"
import { buildOracleAgentConfig } from "../../src/plugin-handlers/oracle-agent-config-builder"
import { applyToolConfig } from "../../src/plugin-handlers/tool-config-handler"
import type { MatrixxConfig } from "../../src/config"

const MODEL = "anthropic/claude-sonnet-4-5"

/**
 * The agent configs are produced by the real factories, so the mode used by the
 * assertions is the mode each agent definition actually declares. No name list.
 */
async function realAgentResult(): Promise<Record<string, unknown>> {
  const oracle = await buildOracleAgentConfig({
    configAgentPlan: undefined,
    pluginOracleOverride: undefined,
    userCategories: undefined,
    currentModel: MODEL,
  })
  return {
    morpheus: createMorpheusAgent(MODEL),
    keymaker: createKeymakerAgent(MODEL),
    architect: createArchitectAgent(MODEL),
    oracle,
    cipher: createCipherAgent(MODEL),
    sentinel: createSentinelAgent(MODEL),
    "bdd-contract": createBddContractAgent(MODEL),
    mouse: createMouseAgentWithOverrides(undefined, MODEL),
  }
}

function permissionOf(agentResult: Record<string, unknown>, name: string): Record<string, unknown> {
  const agent = agentResult[name] as { permission?: Record<string, unknown> }
  return (agent.permission ?? {}) as Record<string, unknown>
}

function modeOf(agentResult: Record<string, unknown>, name: string): string {
  return ((agentResult[name] as { mode?: string })?.mode ?? "subagent") as string
}

function apply(agentResult: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  applyToolConfig({ config, pluginConfig: {} as MatrixxConfig, agentResult })
  return config
}

describe("task-store permission grant (mode-derived)", () => {
  test("every primary/all agent may use the task store", async () => {
    //#given
    const agentResult = await realAgentResult()
    const eligible = Object.keys(agentResult).filter((name) => {
      const mode = modeOf(agentResult, name)
      return mode === "primary" || mode === "all"
    })
    expect(eligible.length).toBeGreaterThan(0)

    //#when
    apply(agentResult)

    //#then
    for (const name of eligible) {
      const permission = permissionOf(agentResult, name)
      expect(`${name}:${String(permission["task_*"])}`).toBe(`${name}:allow`)
    }
  })

  test("keymaker can record task-store progress (it is told to track work with tasks)", async () => {
    //#given
    const agentResult = await realAgentResult()

    //#when
    apply(agentResult)

    //#then
    const permission = permissionOf(agentResult, "keymaker")
    expect(permission["task_*"]).toBe("allow")
    expect(permission.task).toBe("allow")
  })

  test("sentinel keeps its own task denial but gains the task store", async () => {
    //#given
    const agentResult = await realAgentResult()

    //#when
    apply(agentResult)

    //#then
    const permission = permissionOf(agentResult, "sentinel")
    // Read-only applies to files; the task store is a separate write channel.
    expect(permission.task).toBe("deny")
    expect(permission["task_*"]).toBe("allow")
  })

  test("cipher may delegate per its own instructions", async () => {
    //#given
    const agentResult = await realAgentResult()

    //#when
    apply(agentResult)

    //#then
    const permission = permissionOf(agentResult, "cipher")
    expect(permission.task).toBe("allow")
    expect(permission["task_*"]).toBe("allow")
  })

  test("mouse carve-out: a subagent executor still gets full task permissions", async () => {
    //#given
    const agentResult = await realAgentResult()
    expect(modeOf(agentResult, "mouse")).toBe("subagent")

    //#when
    apply(agentResult)

    //#then
    const permission = permissionOf(agentResult, "mouse")
    expect(permission.task).toBe("allow")
    expect(permission["task_*"]).toBe("allow")
  })

  test("a user override is never clobbered by the derived grant", async () => {
    //#given
    const agentResult = await realAgentResult()
    ;(agentResult.keymaker as { permission?: Record<string, unknown> }).permission = {
      "task_*": "deny",
    }

    //#when
    apply(agentResult)

    //#then
    expect(permissionOf(agentResult, "keymaker")["task_*"]).toBe("deny")
  })

  test("the legacy todo tools stay denied globally and per agent", async () => {
    //#given
    const agentResult = await realAgentResult()

    //#when
    const config = apply(agentResult)

    //#then
    const tools = config.tools as Record<string, boolean>
    expect(tools.todowrite).toBe(false)
    expect(tools.todoread).toBe(false)
    expect(permissionOf(agentResult, "keymaker").todowrite).toBe("deny")
  })

  test("a subagent with no task-store role is not granted delegation", async () => {
    //#given
    const agentResult: Record<string, unknown> = {
      "custom-sub": { mode: "subagent" },
    }

    //#when
    apply(agentResult)

    //#then
    const permission = permissionOf(agentResult, "custom-sub")
    expect(permission["task_*"]).toBeUndefined()
    expect(permission.task).toBeUndefined()
  })
})
