/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { applyAgentConfig, setAvailableToolNames } from "../../src/plugin-handlers/agent-config-handler"

const EMPTY_PLUGIN_COMPONENTS = {
  commands: {},
  skills: {},
  agents: {},
  mcpServers: {},
  hooksConfigs: [],
  plugins: [],
  errors: [],
}

function createPluginConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    morpheus_agent: { disabled: false, default_builder_enabled: false, planner_enabled: true, replace_plan: true },
    disabled_agents: [],
    disabled_skills: [],
    categories: {},
    agents: {},
    experimental: {},
    ...overrides,
  } as unknown as Record<string, unknown>
}

describe("agent-config-handler central ctx discipline injector", () => {
  beforeEach(() => {
    setAvailableToolNames([])
  })

  afterEach(() => {
    setAvailableToolNames([])
  })

  it("should not inject when no ctx_/headroom tools present", async () => {
    //#given: no ctx tools
    setAvailableToolNames(["grep", "glob", "read", "bash", "lsp_diagnostics"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: no agent contains injected discipline
    const agents = config.agent as Record<string, Record<string, unknown>>
    for (const [, cfg] of Object.entries(agents)) {
      const prompt = (cfg as { prompt?: string }).prompt ?? ""
      expect(prompt).not.toContain("when ctx_* available")
      expect(prompt).not.toContain("when available")
    }
  })

  it("should inject compact discipline into executors when ctx_* present", async () => {
    //#given: ctx tools available
    setAvailableToolNames(["ctx_search", "ctx_batch_execute", "grep", "read"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: compact agents get tier-2 table
    const agents = config.agent as Record<string, Record<string, unknown>>
    const compactAgents = ["mouse", "cipher", "sati", "sentinel", "architect"]
    for (const name of compactAgents) {
      const prompt = (agents[name] as { prompt?: string })?.prompt ?? ""
      expect(prompt).toContain("when ctx_* available")
      expect(prompt).toContain("ctx_batch_execute")
      expect(prompt).toContain("ctx_search FIRST")
      expect(prompt).toContain("ctx_fetch_and_index")
    }
  })

  it("should inject explore discipline into explore agents when ctx_* present", async () => {
    //#given: ctx tools
    setAvailableToolNames(["ctx_search", "ctx_batch_execute"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: explore tier
    const agents = config.agent as Record<string, Record<string, unknown>>
    const exploreAgents = ["trinity", "operator", "seraph", "smith", "merovingian", "construct", "oracle"]
    for (const name of exploreAgents) {
      const prompt = (agents[name] as { prompt?: string })?.prompt ?? ""
      expect(prompt).toContain("when available")
      expect(prompt).toContain("ctx_search")
      expect(prompt).toContain("grep/glob fallback")
    }
  })

  it("should inject explore discipline into bdd-contract when present via plugin", async () => {
    //#given: ctx tools and bdd-contract via pluginComponents
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        agents: { "bdd-contract": { prompt: "BDD BASE", mode: "subagent" as const } },
      } as never,
    })

    //#then: bdd-contract gets explore tier
    const agents = config.agent as Record<string, Record<string, unknown>>
    const prompt = (agents["bdd-contract"] as { prompt?: string })?.prompt ?? ""
    expect(prompt).toContain("when available")
    expect(prompt).toContain("ctx_search")
  })

  it("should inject headroom discipline when headroom_* present", async () => {
    //#given: headroom only
    setAvailableToolNames(["headroom_retrieve", "headroom_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: all non-morpheus/keymaker get headroom
    const agents = config.agent as Record<string, Record<string, unknown>>
    expect((agents["trinity"] as { prompt?: string }).prompt).toContain("headroom_retrieve")
    expect((agents["mouse"] as { prompt?: string }).prompt).toContain("headroom_retrieve")
  })

  it("should inject both ctx and headroom when both present", async () => {
    //#given: both
    setAvailableToolNames(["ctx_search", "headroom_retrieve"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: trinity gets both, mouse gets both (compact+headroom)
    const agents = config.agent as Record<string, Record<string, unknown>>
    const trinityPrompt = (agents["trinity"] as { prompt?: string }).prompt ?? ""
    expect(trinityPrompt).toContain("ctx_search")
    expect(trinityPrompt).toContain("headroom_retrieve")
    const mousePrompt = (agents["mouse"] as { prompt?: string }).prompt ?? ""
    expect(mousePrompt).toContain("ctx_search")
    expect(mousePrompt).toContain("headroom_retrieve")
  })

  it("should skip morpheus and keymaker (already full discipline)", async () => {
    //#given: ctx tools
    setAvailableToolNames(["ctx_search", "ctx_batch_execute"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: morpheus/keymaker not double-injected with compact
    const agents = config.agent as Record<string, Record<string, unknown>>
    const morpheusPrompt = (agents["morpheus"] as { prompt?: string })?.prompt ?? ""
    expect(morpheusPrompt).toContain("Context Discipline (ALWAYS)")
    expect(morpheusPrompt).not.toContain("when ctx_* available")
    const keymakerPrompt = (agents["keymaker"] as { prompt?: string })?.prompt ?? ""
    if (keymakerPrompt) {
      expect(keymakerPrompt).toContain("Context Discipline (ALWAYS)")
      expect(keymakerPrompt).not.toContain("when ctx_* available")
    }
  })

  it("should be idempotent when prompt already contains Context Discipline", async () => {
    //#given: ctx tools and custom agent already has discipline
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        agents: {
          customBot: { prompt: "BASE PROMPT\n\n### Context Discipline (when ctx_* available)\nold", mode: "subagent" as const },
        },
      } as never,
    })

    //#then: not duplicated
    const agents = config.agent as Record<string, Record<string, unknown>>
    const prompt = (agents["customBot"] as { prompt?: string }).prompt ?? ""
    const count = (prompt.match(/Context Discipline/g) ?? []).length
    expect(count).toBe(1)
  })

  it("should inject compact discipline into custom/plugin agents", async () => {
    //#given: ctx tools and custom agent
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        agents: {
          myCustom: { prompt: "CUSTOM BASE", mode: "subagent" as const },
        },
      } as never,
    })

    //#then: custom gets compact
    const agents = config.agent as Record<string, Record<string, unknown>>
    const prompt = (agents["myCustom"] as { prompt?: string }).prompt ?? ""
    expect(prompt).toContain("when ctx_* available")
    expect(prompt).toContain("ctx_search FIRST")
  })

  it("should handle agents without prompt gracefully", async () => {
    //#given: ctx tools and agent without prompt
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: {
        ...EMPTY_PLUGIN_COMPONENTS,
        agents: {
          noPromptAgent: { mode: "subagent" as const },
        },
      } as never,
    })

    //#then: no throw, agent preserved
    const agents = config.agent as Record<string, Record<string, unknown>>
    expect(agents["noPromptAgent"]).toBeDefined()
  })

  it("should handle case-insensitive explore agent names", async () => {
    //#given: ctx tools
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: explore set is lowercased lookup — trinity/oracle still get explore tier
    const agents = config.agent as Record<string, Record<string, unknown>>
    expect((agents["trinity"] as { prompt?: string }).prompt).toContain("when available")
    expect((agents["oracle"] as { prompt?: string }).prompt).toContain("when available")
  })

  it("should preserve read→edit chain exempt note in compact", async () => {
    //#given: ctx tools
    setAvailableToolNames(["ctx_search"])

    //#when
    const config: Record<string, unknown> = {}
    await applyAgentConfig({
      config,
      pluginConfig: createPluginConfig() as never,
      ctx: { directory: "/tmp" },
      pluginComponents: EMPTY_PLUGIN_COMPONENTS as never,
    })

    //#then: compact mentions LINE#ID exempt
    const agents = config.agent as Record<string, Record<string, unknown>>
    const prompt = (agents["cipher"] as { prompt?: string }).prompt ?? ""
    expect(prompt).toContain("LINE#ID")
  })
})
