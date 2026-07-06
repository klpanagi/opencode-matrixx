import { describe, expect, test } from "bun:test"
import {
  BACKEND_ENGINEER_PROMPT_METADATA,
  createBackendEngineerAgent,
} from "./backend-engineer"

describe("createBackendEngineerAgent", () => {
  //#given a Claude model
  //#when creating the agent
  //#then it should return valid config with thinking enabled
  test("returns AgentConfig with thinking for Claude models", () => {
    const model = "anthropic/claude-opus-4-6"

    const config = createBackendEngineerAgent(model)

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

    const config = createBackendEngineerAgent(model)

    expect(config.model).toBe(model)
    expect(config.reasoningEffort).toBe("medium")
    expect(config.thinking).toBeUndefined()
  })

  //#given the factory function
  //#when checking static mode
  //#then it should be "all" (selectable in menu AND available as subagent)
  test("has all mode", () => {
    expect(createBackendEngineerAgent.mode).toBe("all")
  })

  //#given a model
  //#when creating the agent
  //#then delegate_agent should NOT be denied (empty deny list)
  test("does not deny delegate_agent with empty tool restrictions", () => {
    const config = createBackendEngineerAgent("anthropic/claude-opus-4-6")

    expect(config.permission).toBeDefined()
    expect(config.permission?.delegate_agent).toBeUndefined()
  })

  //#given a model
  //#when creating the agent
  //#then prompt should contain API service generation instructions
  test("prompt contains API service generation instructions", () => {
    const config = createBackendEngineerAgent("anthropic/claude-opus-4-6")

    expect(config.prompt).toContain("API")
    expect(config.prompt).toContain("endpoint")
    expect(config.prompt).toContain("service")
  })

  //#given a model
  //#when creating the agent
  //#then config should include the bdd-backend skill
  test("includes single bdd-backend skill", () => {
    const config = createBackendEngineerAgent("anthropic/claude-opus-4-6")
    const skills = (config as Record<string, unknown>).skills as string[]

    expect(skills).toContain("bdd-backend")
    expect(skills).toHaveLength(1)
  })

  //#given a model
  //#when creating the agent
  //#then description should identify it as Backend API specialist
  test("has correct description mentioning Backend or API", () => {
    const config = createBackendEngineerAgent("anthropic/claude-opus-4-6")

    expect(
      config.description.includes("Backend") || config.description.includes("API"),
    ).toBe(true)
  })
})

describe("BACKEND_ENGINEER_PROMPT_METADATA", () => {
  //#given the metadata
  //#then it should have specialist category and expensive cost
  test("has correct category and cost", () => {
    expect(BACKEND_ENGINEER_PROMPT_METADATA.category).toBe("specialist")
    expect(BACKEND_ENGINEER_PROMPT_METADATA.cost).toBe("EXPENSIVE")
  })

  //#given the metadata
  //#then it should have API/backend-related triggers
  test("has API/backend-related triggers", () => {
    expect(BACKEND_ENGINEER_PROMPT_METADATA.triggers.length).toBeGreaterThanOrEqual(3)
    const domains = BACKEND_ENGINEER_PROMPT_METADATA.triggers.map((t) => t.domain)
    expect(domains).toContain("API Endpoint Authoring")
    expect(domains).toContain("Request/Response Typing")
    expect(domains).toContain("Service Layer Modeling")
  })
})
