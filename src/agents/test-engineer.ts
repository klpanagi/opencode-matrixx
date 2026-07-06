import type { AgentConfig } from "@opencode-ai/sdk"
import { BDD_TESTS_SKILL_NAME } from "../features/builtin-skills/skills/bdd-tests"
import { createAgentToolRestrictions } from "../shared/permission-compat"
import type { AgentMode, AgentPromptMetadata } from "./types"
import { isGptModel } from "./types"

const MODE: AgentMode = "all"

const TEST_ENGINEER_SKILLS = [BDD_TESTS_SKILL_NAME]

export const TEST_ENGINEER_PROMPT_METADATA: AgentPromptMetadata = {
  category: "specialist",
  cost: "EXPENSIVE",
  promptAlias: "TestEngineer",
  keyTrigger:
    "test generation, Cucumber step definitions, TDD, page objects, E2E tests",
  triggers: [
    {
      domain: "Step Definition Authoring",
      trigger:
        "Generating Cucumber step definitions from contracts",
    },
    {
      domain: "Page Object Modeling",
      trigger:
        "Building page object models for E2E tests",
    },
    {
      domain: "E2E Flow Construction",
      trigger:
        "Building comprehensive E2E test flows from feature files",
    },
  ],
  useWhen: [
    "Generating Cucumber step definitions from contracts",
    "Building page object models for E2E tests",
    "Creating comprehensive E2E test suites",
  ],
  avoidWhen: [
    "Production code review — use Merovingian",
    "Security testing — use Sentinel",
    "Frontend component development — use Sati",
  ],
}

const TEST_ENGINEER_SYSTEM_PROMPT = `You are a Test Engineer specializing in Cucumber/BDD test automation. Your role is to generate high-quality E2E tests from BDD Contract JSON files.

<workflow>
1. Read the Contract JSON file
2. Extract feature scenarios and their steps
3. Generate Cucumber step definition files (one per feature)
4. Generate page object classes for UI interactions
5. Verify generated tests compile with \`npx cucumber-js\` via bash
6. Report file paths and pass/fail status
</workflow>

<tool_usage>
- Use read to inspect the Contract JSON
- Use bash to run npx cucumber-js for verification
- DO NOT generate frontend or backend code
- DO NOT modify the Contract
</tool_usage>

<delivery>
Report the generated file paths and the results of npx cucumber-js verification.`

export function createTestEngineerAgent(model: string): AgentConfig {
  const restrictions = createAgentToolRestrictions([])

  const base = {
    description:
      "Test Engineer specializing in Cucumber/BDD E2E test automation. Step definitions, page objects, and test flows from BDD contracts. (TestEngineer - Matrixx)",
    mode: MODE,
    model,
    skills: TEST_ENGINEER_SKILLS,
    temperature: 0.1,
    ...restrictions,
    prompt: TEST_ENGINEER_SYSTEM_PROMPT,
  } as AgentConfig

  if (isGptModel(model)) {
    return {
      ...base,
      maxTokens: 16000,
      reasoningEffort: "medium",
      textVerbosity: "high",
    } as AgentConfig
  }

  return {
    ...base,
    maxTokens: 16000,
    thinking: { type: "enabled", budgetTokens: 10000 },
  } as AgentConfig
}
createTestEngineerAgent.mode = MODE
