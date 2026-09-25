/**
 * Plan Contract Constants
 *
 * Canonical structure of an Oracle work plan: the ordered H2 sections and the
 * required per-task grammar. Checkbox regexes are the single source of truth in
 * mission-state — re-exported here, never re-declared.
 */

export {
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "../../features/mission-state/constants"

/** Ordered H2 section titles, exactly as emitted by the Oracle plan template. */
export const CANONICAL_SECTIONS = [
  "TL;DR",
  "Context",
  "Work Objectives",
  "Verification Strategy (MANDATORY)",
  "Execution Strategy",
  "TODOs",
  "Commit Strategy",
  "Success Criteria",
] as const

/** Ordered labels that every TODO task block must declare. */
export const REQUIRED_TASK_SUBFIELDS = [
  "What to do",
  "Must NOT do",
  "Recommended Agent Profile",
  "Parallelization",
  "References",
  "Acceptance Criteria",
  "Agent-Executed QA Scenarios",
] as const

/** Canonical section title union derived from {@link CANONICAL_SECTIONS}. */
export type PlanSection = (typeof CANONICAL_SECTIONS)[number]

/** Canonical task subfield label union derived from {@link REQUIRED_TASK_SUBFIELDS}. */
export type PlanTaskSubfield = (typeof REQUIRED_TASK_SUBFIELDS)[number]
