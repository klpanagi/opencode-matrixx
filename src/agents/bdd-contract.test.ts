import { describe, expect, test } from "bun:test"
import { BDD_CONTRACT_PROMPT_METADATA, createBddContractAgent } from "./bdd-contract"

describe("createBddContractAgent", () => {
  //#given a Claude model
  //#when creating the agent
  //#then it should return valid config with thinking enabled
  test("returns AgentConfig with thinking for Claude models", () => {
    const model = "anthropic/claude-sonnet-4-5"

    const config = createBddContractAgent(model)

    expect(config.model).toBe(model)
    expect(config.mode).toBe("all")
    expect(config.temperature).toBe(0.1)
    expect(config.thinking).toEqual({ type: "enabled", budgetTokens: 10000 })
    expect(config.reasoningEffort).toBeUndefined()
  })

  //#given a GPT model
  //#when creating the agent
  //#then it should return config with reasoningEffort
  test("returns AgentConfig with reasoningEffort for GPT models", () => {
    const model = "openai/gpt-5.2"

    const config = createBddContractAgent(model)

    expect(config.model).toBe(model)
    expect(config.reasoningEffort).toBe("medium")
    expect(config.thinking).toBeUndefined()
  })

  //#given the factory function
  //#when checking static mode
  //#then it should be "all" (selectable in menu AND available as subagent)
  test("has all mode", () => {
    expect(createBddContractAgent.mode).toBe("all")
  })

  //#given empty tool restrictions
  //#when creating the agent
  //#then delegate_agent should not be denied
  test("does not deny delegate_agent (empty restrictions)", () => {
    const config = createBddContractAgent("anthropic/claude-sonnet-4-5")

    expect(config.permission).toBeDefined()
    expect(config.permission?.delegate_agent).toBeUndefined()
  })

  //#given a model
  //#when creating the agent
  //#then prompt should contain BDD/Gherkin/Contract keywords
  test("prompt contains BDD, Gherkin, and Contract keywords", () => {
    const config = createBddContractAgent("anthropic/claude-sonnet-4-5")

    expect(config.prompt).toContain("BDD")
    expect(config.prompt).toContain("Gherkin")
    expect(config.prompt).toContain("Contract")
  })

  //#given a model
  //#when creating the agent
  //#then config should include the bdd-contract skill
  test("includes single skill: bdd-contract", () => {
    const config = createBddContractAgent("anthropic/claude-sonnet-4-5")
    const skills = (config as Record<string, unknown>).skills as string[]

    expect(skills).toHaveLength(1)
    expect(skills[0]).toBe("bdd-contract")
  })

  //#given a model
  //#when creating the agent
  //#then description should identify it as BDD specialist
  test("has correct description mentioning BDD", () => {
    const config = createBddContractAgent("anthropic/claude-sonnet-4-5")

    expect(config.description).toContain("BDD")
  })
})

describe("BDD_CONTRACT_PROMPT_METADATA", () => {
  //#given the metadata
  //#then it should have specialist category and expensive cost
  test("has correct category and cost", () => {
    expect(BDD_CONTRACT_PROMPT_METADATA.category).toBe("specialist")
    expect(BDD_CONTRACT_PROMPT_METADATA.cost).toBe("EXPENSIVE")
  })

  //#given the metadata
  //#then it should have BDD-related triggers
  test("has at least 3 triggers", () => {
    expect(BDD_CONTRACT_PROMPT_METADATA.triggers.length).toBeGreaterThanOrEqual(3)
    const domains = BDD_CONTRACT_PROMPT_METADATA.triggers.map((t) => t.domain)
    expect(domains).toContain("BDD Design")
  })

  //#given the metadata
  //#then it should have promptAlias
  test("has promptAlias", () => {
    expect(BDD_CONTRACT_PROMPT_METADATA.promptAlias).toBe("BddContract")
  })

  //#given the metadata
  //#then keyTrigger should mention BDD
  test("has keyTrigger mentioning BDD", () => {
    expect(BDD_CONTRACT_PROMPT_METADATA.keyTrigger).toContain("BDD")
  })

  //#given the metadata
  //#then it should have useWhen and avoidWhen lists
  test("has useWhen and avoidWhen lists", () => {
    expect(BDD_CONTRACT_PROMPT_METADATA.useWhen?.length).toBeGreaterThan(0)
    expect(BDD_CONTRACT_PROMPT_METADATA.avoidWhen?.length).toBeGreaterThan(0)
  })
})
