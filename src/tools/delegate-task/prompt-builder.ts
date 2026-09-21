import { buildPlanAgentSystemPrepend, isCodeWritingCategory, isPlanAgent, TDD_TEST_FIRST_APPEND } from "./constants"
import type { BuildSystemContentInput } from "./types"

/**
 * Build the system content to inject into the agent prompt.
 * Combines skill content, category prompt append, and plan agent system prepend.
 * Appends the TDD test-first banner LAST only for code-writing categories.
 */
export function buildSystemContent(input: BuildSystemContentInput): string | undefined {
  const {
    skillContent,
    categoryPromptAppend,
    agentName,
    category,
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

  if (isCodeWritingCategory(category)) {
    parts.push(TDD_TEST_FIRST_APPEND)
  }

  if (parts.length === 0) {
    return undefined
  }

  return parts.join("\n\n")
}

