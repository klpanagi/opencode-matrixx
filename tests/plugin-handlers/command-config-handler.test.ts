/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { MatrixxConfig } from "../../src/config"
import * as builtinCommandsModule from "../../src/features/builtin-commands"

let loadBuiltinCommandsSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  loadBuiltinCommandsSpy = spyOn(builtinCommandsModule, "loadBuiltinCommands").mockReturnValue({})
})

afterEach(() => {
  loadBuiltinCommandsSpy.mockRestore()
})

const EMPTY_PLUGIN_COMPONENTS = {
  commands: {},
  skills: {},
  agents: {},
  mcpServers: {},
  hooksConfigs: [],
  plugins: [],
  errors: [],
}

function createPluginConfig(): MatrixxConfig {
  return {} as MatrixxConfig
}

describe("applyCommandConfig", () => {
  test("does NOT remap agent field from config key to display name (primary regression)", async () => {
    //#given
    const config: Record<string, unknown> = { command: {} }
    const pluginConfig = createPluginConfig()
    const pluginComponents = {
      ...EMPTY_PLUGIN_COMPONENTS,
      commands: {
        "start-work": {
          name: "start-work",
          description: "Start work session",
          agent: "architect",
          template: "template",
        },
      },
    }

    //#when
    const { applyCommandConfig } = await import("../../src/plugin-handlers/command-config-handler")
    await applyCommandConfig({
      config,
      pluginConfig,
      ctx: { directory: "/tmp" },
      pluginComponents,
    })

    //#then
    const result = config.command as Record<string, Record<string, unknown>>
    // This FAILS on current source because remapCommandAgentFields
    // converts "architect" to "Architect (Plan Execution Orchestrator)"
    expect(result["start-work"].agent).toBe("architect")
  })

  test("preserves unknown agent name not in AGENT_DISPLAY_NAMES", async () => {
    //#given
    const config: Record<string, unknown> = { command: {} }
    const pluginConfig = createPluginConfig()
    const pluginComponents = {
      ...EMPTY_PLUGIN_COMPONENTS,
      commands: {
        "my-cmd": {
          name: "my-cmd",
          description: "Custom command",
          agent: "custom-agent",
          template: "template",
        },
      },
    }

    //#when
    const { applyCommandConfig } = await import("../../src/plugin-handlers/command-config-handler")
    await applyCommandConfig({
      config,
      pluginConfig,
      ctx: { directory: "/tmp" },
      pluginComponents,
    })

    //#then
    const result = config.command as Record<string, Record<string, unknown>>
    expect(result["my-cmd"].agent).toBe("custom-agent")
  })

  test("handles command with no agent field", async () => {
    //#given
    const config: Record<string, unknown> = { command: {} }
    const pluginConfig = createPluginConfig()
    const pluginComponents = {
      ...EMPTY_PLUGIN_COMPONENTS,
      commands: {
        "no-agent-cmd": {
          name: "no-agent-cmd",
          description: "Command without agent",
          template: "template",
        },
      },
    }

    //#when
    const { applyCommandConfig } = await import("../../src/plugin-handlers/command-config-handler")
    await applyCommandConfig({
      config,
      pluginConfig,
      ctx: { directory: "/tmp" },
      pluginComponents,
    })

    //#then
    const result = config.command as Record<string, Record<string, unknown>>
    expect(result["no-agent-cmd"]).not.toHaveProperty("agent")
  })

  test("handles empty string agent field", async () => {
    //#given
    const config: Record<string, unknown> = { command: {} }
    const pluginConfig = createPluginConfig()
    const pluginComponents = {
      ...EMPTY_PLUGIN_COMPONENTS,
      commands: {
        "empty-agent-cmd": {
          name: "empty-agent-cmd",
          description: "Command with empty agent",
          agent: "",
          template: "template",
        },
      },
    }

    //#when
    const { applyCommandConfig } = await import("../../src/plugin-handlers/command-config-handler")
    await applyCommandConfig({
      config,
      pluginConfig,
      ctx: { directory: "/tmp" },
      pluginComponents,
    })

    //#then
    const result = config.command as Record<string, Record<string, unknown>>
    expect(result["empty-agent-cmd"].agent).toBe("")
  })
})
