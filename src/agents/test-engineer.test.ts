import { describe, expect, test } from "bun:test"
import {
  createTestEngineerAgent,
  TEST_ENGINEER_PROMPT_METADATA,
} from "./test-engineer"

describe("createTestEngineerAgent", () => {
  //#given a Claude model
  //#when creating the agent
  //#then it should return valid config with thinking enabled
  test("returns AgentConfig with thinking for Claude models", () => {
    const model = "anthropic/claude-opus-4-6"

    const config = createTestEngineerAgent(model)

    expect(config.model).toBe(model)
    expect(config.mode).toBe("all")
    expect(config.temperature).toBe(0.1)
    expect(config.thinking).toEqual({
      type: "enabled",
      budgetTokens: 10000,
    })
    expect(config.reasoningEffort).toBeUndefined()
  })

  //#given a GPT model
  //#when creating the agent
  //#then it should return config with reasoningEffort
  test("returns AgentConfig with reasoningEffort for GPT models", () => {
    const model = "openai/gpt-5.2"

    const config = createTestEngineerAgent(model)

    expect(config.model).toBe(model)
    expect(config.reasoningEffort).toBe("medium")
    expect(config.thinking).toBeUndefined()
  })

  //#given the factory function
  //#when checking static mode
  //#then it should be "all" (selectable in menu AND available as subagent)
  test("has all mode", () => {
    expect(createTestEngineerAgent.mode).toBe("all")
  })

  //#given a model
  //#when creating the agent
  //#then delegate_agent should NOT be denied (empty restrictions)
  test("does not deny delegate_agent", () => {
    const config = createTestEngineerAgent("anthropic/claude-opus-4-6")

    expect(config.permission).toBeDefined()
    expect(config.permission?.delegate_agent).toBeUndefined()
  })

  //#given a model
  //#when creating the agent
  //#then prompt should contain BDD test generation instructions
  test("prompt contains BDD test generation instructions", () => {
    const config = createTestEngineerAgent("anthropic/claude-opus-4-6")

    expect(config.prompt).toContain("step definition")
    expect(config.prompt).toContain("Cucumber")
    expect(config.prompt).toContain("page object")
  })

  //#given a model
  //#when creating the agent
  //#then config should include the bdd-tests skill
  test("includes bdd-tests skill", () => {
    const config = createTestEngineerAgent("anthropic/claude-opus-4-6")
    const skills = (config as Record<string, unknown>).skills as string[]

    expect(skills).toContain("bdd-tests")
    expect(skills).toHaveLength(1)
  })

  //#given a model
  //#when creating the agent
  //#then description should identify it as test engineer
  test("has correct description", () => {
    const config = createTestEngineerAgent("anthropic/claude-opus-4-6")

    expect(config.description).toContain("Test")
    expect(config.description).toContain("TestEngineer")
  })
})

describe("TEST_ENGINEER_PROMPT_METADATA", () => {
  //#given the metadata
  //#then it should have specialist category and expensive cost
  test("has correct category and cost", () => {
    expect(TEST_ENGINEER_PROMPT_METADATA.category).toBe("specialist")
    expect(TEST_ENGINEER_PROMPT_METADATA.cost).toBe("EXPENSIVE")
  })

  //#given the metadata
  //#then it should have at least 3 triggers
  test("has at least 3 triggers", () => {
    expect(
      TEST_ENGINEER_PROMPT_METADATA.triggers.length,
    ).toBeGreaterThanOrEqual(3)
    const domains = TEST_ENGINEER_PROMPT_METADATA.triggers.map(
      (t) => t.domain,
    )
    expect(domains).toContain("Step Definition Authoring")
    expect(domains).toContain("Page Object Modeling")
    expect(domains).toContain("E2E Flow Construction")
  })

  //#given the metadata
  //#then it should have promptAlias
  test("has promptAlias", () => {
    expect(TEST_ENGINEER_PROMPT_METADATA.promptAlias).toBe("TestEngineer")
  })

  //#given the metadata
  //#then keyTrigger should mention test-related terms
  test("has keyTrigger mentioning test generation", () => {
    expect(TEST_ENGINEER_PROMPT_METADATA.keyTrigger).toContain("test")
  })

  //#given the metadata
  //#then it should have useWhen and avoidWhen lists
  test("has useWhen and avoidWhen lists", () => {
    expect(TEST_ENGINEER_PROMPT_METADATA.useWhen?.length).toBeGreaterThan(
      0,
    )
    expect(
      TEST_ENGINEER_PROMPT_METADATA.avoidWhen?.length,
    ).toBeGreaterThan(0)
  })
})
