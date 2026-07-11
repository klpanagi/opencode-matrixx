/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { MatrixxConfig } from "../../src/config"

import * as mcpModule from "../../src/mcp"
import * as shared from "../../src/shared"

let createBuiltinMcpsSpy: ReturnType<typeof spyOn>
let logSpy: ReturnType<typeof spyOn>

beforeEach(() => {
  createBuiltinMcpsSpy = spyOn(mcpModule, "createBuiltinMcps").mockReturnValue({})
  logSpy = spyOn(shared, "log").mockImplementation(() => {})
})

afterEach(() => {
  createBuiltinMcpsSpy.mockRestore()
  logSpy.mockRestore()
})

function createPluginConfig(overrides: Partial<MatrixxConfig> = {}): MatrixxConfig {
  return {
    disabled_mcps: [],
    ...overrides,
  } as MatrixxConfig
}

const EMPTY_PLUGIN_COMPONENTS = {
  commands: {},
  skills: {},
  agents: {},
  mcpServers: {},
  hooksConfigs: [],
  plugins: [],
  errors: [],
}

describe("applyMcpConfig", () => {
  test("preserves enabled:false from user config", async () => {
    //#given
    const userMcp = {
      firecrawl: { type: "remote", url: "https://firecrawl.example.com", enabled: false },
      exa: { type: "remote", url: "https://exa.example.com", enabled: true },
    }

    const config: Record<string, unknown> = { mcp: userMcp }
    const pluginConfig = createPluginConfig()

    //#when
    const { applyMcpConfig } = await import("../../src/plugin-handlers/mcp-config-handler")
    await applyMcpConfig({ config, pluginConfig, pluginComponents: EMPTY_PLUGIN_COMPONENTS })

    //#then
    const mergedMcp = config.mcp as Record<string, Record<string, unknown>>
    expect(mergedMcp.firecrawl.enabled).toBe(false)
    expect(mergedMcp.exa.enabled).toBe(true)
  })

  test("applies disabled_mcps to MCPs from all sources", async () => {
    //#given
    createBuiltinMcpsSpy.mockReturnValue({
      websearch: { type: "remote", url: "https://mcp.exa.ai/mcp", enabled: true },
    })

    const config: Record<string, unknown> = { mcp: {} }
    const pluginConfig = createPluginConfig({ disabled_mcps: ["playwright"] })

    //#when
    const { applyMcpConfig } = await import("../../src/plugin-handlers/mcp-config-handler")
    await applyMcpConfig({
      config,
      pluginConfig,
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        mcpServers: {
          "plugin:custom": { type: "local", command: ["npx", "custom"], enabled: true },
        },
      },
    })

    //#then
    const mergedMcp = config.mcp as Record<string, Record<string, unknown>>
    expect(mergedMcp).not.toHaveProperty("playwright")
    expect(mergedMcp).toHaveProperty("websearch")
    expect(mergedMcp).toHaveProperty("plugin:custom")
  })

  test("works when no user MCPs have enabled:false", async () => {
    //#given
    const userMcp = {
      exa: { type: "remote", url: "https://exa.example.com", enabled: true },
      firecrawl: { type: "remote", url: "https://firecrawl.example.com", enabled: true },
    }

    const config: Record<string, unknown> = { mcp: userMcp }
    const pluginConfig = createPluginConfig()

    //#when
    const { applyMcpConfig } = await import("../../src/plugin-handlers/mcp-config-handler")
    await applyMcpConfig({ config, pluginConfig, pluginComponents: EMPTY_PLUGIN_COMPONENTS })

    //#then
    const mergedMcp = config.mcp as Record<string, Record<string, unknown>>
    expect(mergedMcp.exa.enabled).toBe(true)
    expect(mergedMcp.firecrawl.enabled).toBe(true)
  })

  test("deletes plugin MCPs that are in disabled_mcps", async () => {
    //#given
    const config: Record<string, unknown> = { mcp: {} }
    const pluginConfig = createPluginConfig({ disabled_mcps: ["plugin:custom"] })

    //#when
    const { applyMcpConfig } = await import("../../src/plugin-handlers/mcp-config-handler")
    await applyMcpConfig({
      config,
      pluginConfig,
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        mcpServers: {
          "plugin:custom": { type: "local", command: ["npx", "custom"], enabled: true },
        },
      },
    })

    //#then
    const mergedMcp = config.mcp as Record<string, Record<string, unknown>>
    expect(mergedMcp).not.toHaveProperty("plugin:custom")
  })
})
