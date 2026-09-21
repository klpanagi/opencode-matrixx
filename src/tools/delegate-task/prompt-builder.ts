import { buildPlanAgentSystemPrepend, isPlanAgent, TDD_TEST_FIRST_APPEND } from "./constants"
import type { BuildSystemContentInput } from "./types"

/**
 * Build the system content to inject into the agent prompt.
 * Combines skill content, category prompt append, and plan agent system prepend.
 * Always appends the TDD test-first banner LAST so the requirement is visible
 * even when the caller omitted the tdd-enforcer skill.
 */
export function buildSystemContent(input: BuildSystemContentInput): string | undefined {
  const {
    skillContent,
    categoryPromptAppend,
    agentName,
    availableCategories,
    availableSkills,
  } = input

  const planAgentPrepend = isPlanAgent(agentName)
    ? buildPlanAgentSystemPrepend(availableCategories, availableSkills)
    : ""

  const parts: string[] = []

  if (planAgentPrepend) {
    parts.push(planAgentPrepend)
  }

  if (skillContent) {
    parts.push(skillContent)
  }

  if (categoryPromptAppend) {
    parts.push(categoryPromptAppend)
  }

  parts.push(TDD_TEST_FIRST_APPEND)

  return parts.join("\n\n")
}

