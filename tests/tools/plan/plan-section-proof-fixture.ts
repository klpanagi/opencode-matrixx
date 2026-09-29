/**
 * Task 12 fixture: a REALISTIC synthetic plan, deterministic across runs.
 *
 * WHY FRONT MATTER IS PRE-SERIALIZED: `plan-update.ts` re-injects
 * `serializePlanFrontMatter(DEFAULT_FRONT_MATTER)` when `shouldMigrate()` is true
 * for the post-edit text. That prepend SHIFTS every `startLine` in the file, and
 * because `computeSectionHash` folds `startLine` into the hash, EVERY section's
 * `contentHash` would move on the first write. A byte-equality suite that started
 * from a front-matter-less fixture would therefore be comparing two different
 * documents and would prove nothing. This fixture starts with the same
 * serialization the injector would have produced, so the only byte movement in a
 * section edit is the edit itself.
 *
 * The eight H2 texts are `CANONICAL_SECTIONS` from
 * `src/features/plan-contract/constants.ts` — read, not guessed. Note the
 * SEMICOLON in `TL;DR` and the `(MANDATORY)` suffix on
 * `Verification Strategy (MANDATORY)`.
 */
import { serializePlanFrontMatter } from "../../../src/features/plan-contract"

/** The two trailing spaces on this line are the round-trip CANARY. */
/** `\*` below is the ESCAPED-CHARACTER canary. */
const CANARY_TABLE = [
  "| Column | Value |",
  "| --- | --- |",
  "| `escaped \\* star` | value |",
  "| backslash \\\\ literal | value |",
].join("\n")

const BODY = [
  "# Section Addressing Proof Plan",
  "",
  "## TL;DR",
  "Proves a section-scoped write is lossless outside its target span.",
  "",
  "## Context",
  "Context line one.",
  "Context line two.",
  "",
  "## Work Objectives",
  "Objective A: measure before.",
  "Objective B: measure after.",
  "",
  "### Canary Table",
  CANARY_TABLE,
  "Hard break follows.  ",
  "",
  "## Verification Strategy (MANDATORY)",
  "Run the suite and diff the hashes.",
  "",
  "### Agent-Executed QA Scenarios",
  "1. md5 the file and record every contentHash.",
  "2. Edit the last section, re-index, compare.",
  "",
  "## Execution Strategy",
  "Wave 1 does the read path.",
  "Wave 2 does the write path.",
  "",
  "## TODOs",
  "- [ ] 1. first task",
  "- [x] 2. second task",
  "",
  "### Task Grammar",
  "- **What to do:** read the plan, edit one section",
  "- **Must NOT do:** edit any file under src",
  "",
  "## Commit Strategy",
  "Merge commit only.",
  "",
  "## Success Criteria",
  "Every untouched section keeps its contentHash.",
  "",
].join("\n")

export function buildProofPlan(): string {
  return `${serializePlanFrontMatter({ status: "pending", revision: 1 })}${BODY}`
}

/** The file name every Task 12 test writes into its own temp project dir. */
export const PROOF_PLAN_NAME = "proof-plan.md"

/** Repo-relative form, as the tool args expect it. */
export const PROOF_PLAN_REL = ".matrixx/plans/proof-plan.md"

/** The exact original line slice `[startLine, endLine)` of a section. */
export function originalSlice(content: string, startLine: number, endLine: number): string {
  return content.split("\n").slice(startLine - 1, endLine - 1).join("\n")
}
