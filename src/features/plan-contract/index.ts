/**
 * Plan Contract — barrel
 *
 * Foundation module for the plan contract: canonical sections, task grammar,
 * and the Zod schema for the structured plan view.
 */

export { findAppendixStart } from "./appendix"
export {
  CANONICAL_SECTIONS,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  type PlanSection,
  type PlanTaskSubfield,
  REQUIRED_TASK_SUBFIELDS,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "./constants"
export { parsePlanFrontMatter, serializePlanFrontMatter } from "./front-matter"
export { isGrandfathered, shouldMigrate } from "./migration"
export { type PlanContract, PlanContractSchema } from "./schema"
export { renderPlanSkeleton } from "./skeleton"
export type {
  PlanContractResult,
  PlanContractWarning,
  PlanFrontMatter,
  PlanStatus,
  PlanTask,
} from "./types"

export { parsePlanContract, parsePlanTasks, validatePlanContract } from "./validate"
