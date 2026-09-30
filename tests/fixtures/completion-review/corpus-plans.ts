/// <reference types="bun-types" />
/**
 * Committed fixture corpus for the Plan B precondition gate.
 *
 * WHY THIS IS COMMITTED INSTEAD OF MEASURED FROM `.matrixx/plans/`: that
 * directory is gitignored, so a CI checkout has no corpus. A gate measured
 * against it is green only on the machine that wrote it. These plans are real
 * plan markdown — the 8 canonical H2s from
 * `src/features/plan-contract/constants.ts`, all 14 consensus H3 registry
 * seeds, numbered task checkboxes — generated deterministically so 32 distinct
 * plans exist without 32 near-duplicate files.
 *
 * SHAPE THE GATE NEEDS:
 *   - every rubric H3 (Guardrails / Deliverables / Test Decision) present with
 *     a NON-EMPTY body in all 32 plans, clearing MIN_CORPUS_RESOLUTIONS (20);
 *   - 14 H3s per plan against 8 H2s, so H3 coverage exceeds H2 coverage;
 *   - guardrails spelled three ways across the corpus, so the case-insensitive
 *     normalizer's drift tolerance is exercised rather than assumed.
 *
 * `.matrixx/plans/` is NEVER read: every measurement here is in-memory content.
 */
import type { PlanSource } from "../../features/completion-review/precondition-corpus"

/** Plans in the committed corpus. 32 >= MIN_CORPUS_RESOLUTIONS (20) + headroom. */
export const FIXTURE_PLAN_COUNT = 32

/** The three spellings real plans use for the guardrails H3. */
const GUARDRAILS_SPELLINGS = [
  "Must NOT Have (Guardrails)",
  "Must NOT Have (guardrails)",
  "Must NOT have (guardrails)",
] as const

const SLUGS = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
  "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
  "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey", "xray",
  "yankee", "zulu", "one-more", "second-batch", "third-batch", "fourth-batch", "fifth-batch", "sixth-batch",
] as const

function fixturePlan(index: number): PlanSource {
  const slug = SLUGS[index] ?? `plan-${index}`
  const guardrails = GUARDRAILS_SPELLINGS[index % GUARDRAILS_SPELLINGS.length] ?? "Must NOT Have (Guardrails)"
  const lines = [
    `# Fixture Plan ${slug}`,
    "",
    "## TL;DR",
    `Fixture plan ${slug} exists to exercise the precondition corpus gate.`,
    "",
    "## Context",
    "The gate must hold on a machine that has never seen a live plan corpus.",
    "",
    "### Original Request",
    "Prove the section registry surface without reading a gitignored directory.",
    "",
    "### Interview Summary",
    "No interview; the constraint is CI reproducibility.",
    "",
    "## Work Objectives",
    "Cover every consensus H3 so H3 coverage provably exceeds H2 coverage.",
    "",
    "### Core Objective",
    `Objective ${slug}: keep the rubric H3 surface resolvable.`,
    "",
    "### Must Have",
    "- a non-empty guardrails body",
    "- a non-empty deliverables body",
    "- a non-empty test decision body",
    "",
    `### ${guardrails}`,
    "- no `as any`",
    "- no `@ts-ignore`",
    "",
    "### Concrete Deliverables",
    "- a passing gate",
    `- a fixture plan named ${slug}`,
    "",
    "### Test Decision",
    "TDD is required: the negative scenario must fail before the gate is trusted.",
    "",
    "### Definition of Done",
    "`bun run typecheck`, `bun run lint`, the isolated test run and `bun run build` all pass.",
    "",
    "## Verification Strategy (MANDATORY)",
    "Run the suite from a scratch directory that contains no `.matrixx/` at all.",
    "",
    "### Verification Commands",
    "- `bun test tests/features/completion-review`",
    "",
    "### Final Checklist",
    "- [x] fixtures committed",
    "- [x] no gitignored read",
    "",
    "## Execution Strategy",
    "Single writer; the gate is a predicate, not a service.",
    "",
    "### Parallel Execution Waves",
    "Wave 1: fixtures. Wave 2: assertions.",
    "",
    "### Dependency Matrix",
    "Assertions depend on the committed corpus.",
    "",
    "### Agent Dispatch Summary",
    "One implementer, one reviewer.",
    "",
    "## TODOs",
    "",
    "### Seraph Review",
    "No blocking review finding for this fixture.",
    "",
    `- [ ] 1. Task ${slug} first`,
    `- [ ] 2. Task ${slug} second`,
    "",
    "## Commit Strategy",
    "One commit per task; no history rewriting.",
    "",
    "## Success Criteria",
    "The gate holds without a live corpus and fails on a simulated-absent registry.",
  ]
  return { name: `${slug}-plan.md`, content: `${lines.join("\n")}\n` }
}

/** The whole committed corpus, in a stable order. */
export function fixtureCorpus(): PlanSource[] {
  return Array.from({ length: FIXTURE_PLAN_COUNT }, (_, index) => fixturePlan(index))
}
