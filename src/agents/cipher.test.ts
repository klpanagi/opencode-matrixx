import { describe, test, expect } from "bun:test"
import { createCipherAgent, CIPHER_PROMPT_METADATA } from "./cipher"

describe("createCipherAgent", () => {
  //#given a Claude model
  //#when creating the agent
  //#then it should return valid config with thinking enabled
  test("returns AgentConfig with thinking for Claude models", () => {
    const model = "anthropic/claude-opus-4-6"

    const config = createCipherAgent(model)

    expect(config.model).toBe(model)
    expect(config.mode).toBe("subagent")
    expect(config.temperature).toBe(0.1)
    expect(config.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
    expect(config.reasoningEffort).toBeUndefined()
  })

  //#given a GPT model
  //#when creating the agent
  //#then it should return config with reasoningEffort
  test("returns AgentConfig with reasoningEffort for GPT models", () => {
    const model = "openai/gpt-5.2"

    const config = createCipherAgent(model)

    expect(config.model).toBe(model)
    expect(config.reasoningEffort).toBe("medium")
    expect(config.thinking).toBeUndefined()
  })

  //#given the factory function
  //#when checking static mode
  //#then it should be subagent
  test("has subagent mode", () => {
    expect(createCipherAgent.mode).toBe("subagent")
  })

  //#given a model
  //#when creating the agent
  //#then task and call_omo_agent tools should be denied
  test("denies task and call_omo_agent tools", () => {
    const config = createCipherAgent("anthropic/claude-opus-4-6")

    expect(config.permission).toBeDefined()
    expect(config.permission!["task"]).toBe("deny")
    expect(config.permission!["call_omo_agent"]).toBe("deny")
  })

  //#given a model
  //#when creating the agent
  //#then prompt should contain all five sub-specialization keywords
  test("prompt contains all sub-specialization keywords", () => {
    const config = createCipherAgent("anthropic/claude-opus-4-6")

    expect(config.prompt).toContain("Grammar Architect")
    expect(config.prompt).toContain("Semantic Analyst")
    expect(config.prompt).toContain("Toolsmith")
    expect(config.prompt).toContain("Code Generator")
    expect(config.prompt).toContain("Metamodel Designer")
  })

  //#given a model
  //#when creating the agent
  //#then prompt should contain all five expert constraint keywords
  test("prompt contains expert constraint keywords", () => {
    const config = createCipherAgent("anthropic/claude-opus-4-6")

    expect(config.prompt).toContain("FORMAL GRAMMAR FIRST")
    expect(config.prompt).toContain("SOUND TYPE SYSTEMS")
    expect(config.prompt).toContain("COMPOSABILITY")
    expect(config.prompt).toContain("ERROR REPORTING")
    expect(config.prompt).toContain("INCREMENTAL PARSING")
  })

  //#given a model
  //#when creating the agent
  //#then prompt should reference key frameworks
  test("prompt contains framework references", () => {
    const config = createCipherAgent("anthropic/claude-opus-4-6")

    expect(config.prompt).toContain("textX")
    expect(config.prompt).toContain("PyEcore")
    expect(config.prompt).toContain("ANTLR4")
    expect(config.prompt).toContain("Tree-sitter")
    expect(config.prompt).toContain("Langium")
    expect(config.prompt).toContain("Chevrotain")
  })

  //#given a model
  //#when creating the agent
  //#then description should identify it as DSL specialist
  test("has correct description", () => {
    const config = createCipherAgent("anthropic/claude-opus-4-6")

    expect(config.description).toContain("DSL")
    expect(config.description).toContain("Cipher")
  })
})

describe("CIPHER_PROMPT_METADATA", () => {
  //#given the metadata
  //#then it should have specialist category and expensive cost
  test("has correct category and cost", () => {
    expect(CIPHER_PROMPT_METADATA.category).toBe("specialist")
    expect(CIPHER_PROMPT_METADATA.cost).toBe("EXPENSIVE")
  })

  //#given the metadata
  //#then it should have DSL-related triggers
  test("has DSL-related triggers", () => {
    expect(CIPHER_PROMPT_METADATA.triggers.length).toBeGreaterThanOrEqual(3)
    const domains = CIPHER_PROMPT_METADATA.triggers.map((t) => t.domain)
    expect(domains).toContain("DSL Design")
    expect(domains).toContain("Parser Engineering")
    expect(domains).toContain("Code Generation")
    expect(domains).toContain("Metamodeling")
  })

  //#given the metadata
  //#then it should have promptAlias
  test("has promptAlias", () => {
    expect(CIPHER_PROMPT_METADATA.promptAlias).toBe("Cipher")
  })

  //#given the metadata
  //#then keyTrigger should mention DSL
  test("has keyTrigger mentioning DSL", () => {
    expect(CIPHER_PROMPT_METADATA.keyTrigger).toContain("DSL")
  })

  //#given the metadata
  //#then it should have useWhen and avoidWhen lists
  test("has useWhen and avoidWhen lists", () => {
    expect(CIPHER_PROMPT_METADATA.useWhen!.length).toBeGreaterThan(0)
    expect(CIPHER_PROMPT_METADATA.avoidWhen!.length).toBeGreaterThan(0)
  })
})
