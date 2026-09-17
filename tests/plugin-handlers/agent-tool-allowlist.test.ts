/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import {
  applyAgentToolAllowlist,
  DEFAULT_TOOL_ALLOWLIST,
} from "../../src/plugin-handlers/agent-tool-allowlist"

function toolsOf(agentResult: Record<string, unknown>, name: string): Record<string, boolean> {
  return (agentResult[name] as { tools: Record<string, boolean> }).tools
}

describe("pilot per-agent tool allowlists (TODO-2)", () => {
  test("unset fills pilot defaults", () => {
    //#given
    const agentResult: Record<string, unknown> = {
      trinity: {},
      operator: {},
      oracle: {},
    }

    //#when
    applyAgentToolAllowlist({ agentResult, pluginConfig: {} })

    //#then
    for (const name of ["trinity", "operator", "oracle"] as const) {
      const defaults = DEFAULT_TOOL_ALLOWLIST[name]
      const tools = toolsOf(agentResult, name)
      for (const [tool, value] of Object.entries(defaults)) {
        expect(tools[tool]).toBe(value)
      }
    }
  })

  test("user false preserved (never overwrite)", () => {
    //#given
    const firstDefaultKey = Object.keys(DEFAULT_TOOL_ALLOWLIST.trinity)[0] as string
    const agentResult: Record<string, unknown> = {
      trinity: { tools: { [firstDefaultKey]: false } },
    }

    //#when
    applyAgentToolAllowlist({ agentResult, pluginConfig: {} })

    //#then
    expect(toolsOf(agentResult, "trinity")[firstDefaultKey]).toBe(false)
  })

  test("global disabled_tools deny wins last", () => {
    //#given
    const firstDefaultKey = Object.keys(DEFAULT_TOOL_ALLOWLIST.operator)[0] as string
    const agentResult: Record<string, unknown> = { operator: {} }

    //#when
    applyAgentToolAllowlist({
      agentResult,
      pluginConfig: { disabled_tools: [firstDefaultKey] },
    })

    //#then
    expect(toolsOf(agentResult, "operator")[firstDefaultKey]).toBe(false)
  })

  test("non-pilot agents untouched", () => {
    //#given
    const agentResult: Record<string, unknown> = { morpheus: {} }

    //#when
    applyAgentToolAllowlist({ agentResult, pluginConfig: {} })

    //#then
    expect((agentResult.morpheus as Record<string, unknown>).tools).toBeUndefined()
  })
})
