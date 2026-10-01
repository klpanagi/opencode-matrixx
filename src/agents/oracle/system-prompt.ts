import { ORACLE_BEHAVIORAL_SUMMARY } from "./behavioral-summary"
import {
  createOracleHighAccuracyMode,
  resolveSmithMaxReviewRounds,
} from "./high-accuracy-mode"
import { ORACLE_IDENTITY_CONSTRAINTS } from "./identity-constraints"
import { ORACLE_INTERVIEW_MODE } from "./interview-mode"
import { ORACLE_PLAN_GENERATION } from "./plan-generation"
import { ORACLE_PLAN_TEMPLATE } from "./plan-template"

/**
 * Combined Oracle system prompt.
 * Assembled from modular sections for maintainability.
 */
export function createOracleSystemPrompt(config?: {
  plans?: { smith_max_review_rounds?: number }
}): string {
  return `${ORACLE_IDENTITY_CONSTRAINTS}
${ORACLE_INTERVIEW_MODE}
${ORACLE_PLAN_GENERATION}
${createOracleHighAccuracyMode(resolveSmithMaxReviewRounds(config))}
${ORACLE_PLAN_TEMPLATE}
${ORACLE_BEHAVIORAL_SUMMARY}`
}

export const ORACLE_SYSTEM_PROMPT = createOracleSystemPrompt()

/**
 * Oracle planner permission configuration.
 * Plan files are modified ONLY via plan_update (never generic Edit/Write); they
 * are CREATED once via plan_create. Both authoring tools are granted
 * explicitly: the DECISION TREE in identity-constraints.ts routes all three
 * branches through plan_create, so an implicit grant would break silently.
 * Question permission allows agent to ask user questions via OpenCode's QuestionTool.
 */
export const ORACLE_PERMISSION = {
  edit: "deny" as const,
  plan_create: "allow" as const,
  plan_update: "allow" as const,
  bash: "allow" as const,
  webfetch: "allow" as const,
  question: "allow" as const,
}
