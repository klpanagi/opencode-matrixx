/**
 * Plan Contract — barrel
 *
 * Foundation module for the plan contract: canonical sections, task grammar,
 * and the Zod schema for the structured plan view.
 */

export {
  collectNamedRegions,
  findAppendixStart,
  findNamedRegion,
  type NamedRegion,
  type RegionStart,
  type RegionStartPredicate,
} from "./appendix"
export {
  CANONICAL_SECTIONS,
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  OPTIONAL_TASK_SUBFIELDS,
  type PlanSection,
  type PlanTaskSubfield,
  REQUIRED_TASK_SUBFIELDS,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "./constants"
export { parsePlanFrontMatter, serializePlanFrontMatter } from "./front-matter"
export {
  classifyPlanLifecycle,
  PLAN_LIFECYCLE_CODES,
  type PlanLifecycleCode,
  type PlanLifecycleReport,
  type PlanLifecycleState,
  type PlanSectionLifecycleResolution,
  resolveLifecycleSection,
} from "./lifecycle"
export { isGrandfathered, shouldMigrate } from "./migration"
export {
  collectHeadings,
  type HashlineAnchors,
  type Heading,
  normalizeSectionTitle,
  parsePlanContract,
  parsePlanTasks,
} from "./parse"
export { type PlanContract, PlanContractSchema } from "./schema"
export {
  buildSectionRegistry,
  CONSENSUS_H3_SEEDS,
  extractHeadingLevel,
  extractHeadingText,
  H3_SECTION_REGISTRY,
  normalizeSectionKey,
  PLAN_SECTION_REGISTRY,
  resolveSectionSelector,
  SECTION_REGISTRY,
  type SectionLevel,
  type SectionRegistryEntry,
  type SectionRegistrySeed,
  type SectionResolution,
  type SectionResolutionKind,
} from "./section-registry"
export { renderPlanSkeleton } from "./skeleton"

export type {
  PlanContractResult,
  PlanContractWarning,
  PlanFrontMatter,
  PlanStatus,
  PlanTask,
} from "./types"

export { validatePlanContract } from "./validate"
