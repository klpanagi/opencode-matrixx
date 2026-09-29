/**
 * H3 consensus seeds — the 14 empirically-common H3 headings across the
 * 35-plan corpus. Held in their own module purely for the 200-LOC budget;
 * the ids are DERIVED by `buildSectionRegistry` in `section-registry.ts`,
 * never hand-written here.
 *
 * WHY EXACT SPELLINGS: each string is the canonical text the plan skeleton
 * emits (`skeleton.ts` section bodies), so an id derived here is the same id
 * a real plan produces. Do NOT add aliases for `### If TDD Enabled` or
 * `### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)` — those are
 * deliberately unregistered and land in the `custom` escape hatch.
 */
import type { SectionRegistrySeed } from "./section-registry"

export const CONSENSUS_H3_SEEDS: readonly SectionRegistrySeed[] = [
  "Original Request",
  "Interview Summary",
  "Seraph Review",
  "Core Objective",
  "Concrete Deliverables",
  "Definition of Done",
  "Must Have",
  "Must NOT Have (Guardrails)",
  "Test Decision",
  "Parallel Execution Waves",
  "Dependency Matrix",
  "Agent Dispatch Summary",
  "Verification Commands",
  "Final Checklist",
].map((heading) => ({ heading, level: 3 as const }))
