/**
 * Plan Front-Matter Migration & Grandfathering
 *
 * Front-matter is ADDITIVE over the legacy `<!-- plan-persister: {...} -->`
 * comment (`mission-state/plan-storage.ts`) — it does not replace it. Migration
 * is apply-on-next-edit ONLY: no `plan_migrate` tool is shipped and no plan is
 * rewritten automatically.
 *
 * Grandfathering protects the pre-existing plan corpus from retro-breaking: a
 * plan that lacks front-matter is only exempt when its id is on the frozen
 * {@link GRANDFATHER_ALLOWLIST}. A brand-new plan lacking front-matter is NOT
 * grandfathered.
 */

import { basename } from "node:path"
import { parsePlanFrontMatter } from "./front-matter"

/**
 * Frozen allowlist of plan ids (filename without `.md`) that predate the
 * front-matter requirement — captured from the live `.matrixx/plans` corpus
 * (23 files) at planning time.
 *
 * Grandfathered plans never emit a front-matter warning and are exempt from any
 * future FAIL-mode front-matter requirement. The exemption clears as soon as
 * the plan gains a front-matter block.
 *
 * WHY THE ARCHIVED `p2.*` ENTRIES STAY (deliberate, not tidiness):
 * `p2.1-trim-hooks`, `p2.2-generic-recovery-refactor` and `p2.3-evolution-gating`
 * were MOVED to `.matrixx/plans/_archive/`, but they are NOT removed. Three
 * code-grounded reasons to keep the keys:
 *
 * 1. The lookup is by BASENAME (`basename(filePath, ".md")` in `isGrandfathered`,
 *    and `classifyPlanLifecycle` in `lifecycle.ts`), not by directory. Archival
 *    relocates the file but does not change its id, so the key is still the
 *    correct key for that plan wherever it lives.
 * 2. The exemption is a property of the plan's HISTORY (it predates the
 *    front-matter requirement), not of its current location. Archival is a
 *    storage decision; it does not retroactively make a plan "new".
 * 3. `src/tools/plan/types.ts` rejects subdirectory paths, so `_archive/` is
 *    outside the plan-tool surface entirely — a key that resolves to an archived
 *    file can never be reached through a tool call, and `lifecycle.ts` rule 5
 *    states the registry deliberately does NOT special-case `_archive/`. Pruning
 *    would therefore change NO reachable lifecycle state: it would only risk a
 *    future un-archive (or a `reconcile.ts` archival move that a human later
 *    reverses) silently demoting a legacy plan from `grandfathered` to
 *    `legacy_renamed`.
 *
 * The list stays at its captured 23 ids. The known hazard is unchanged and
 * documented in `lifecycle.ts`: a RENAME falls off this list silently and is
 * surfaced as the advisory `legacy_plan_renamed_off_allowlist` rather than
 * auto-re-adopted.
 */
export const GRANDFATHER_ALLOWLIST: readonly string[] = Object.freeze([
  "add-commandcode-reasoning-variants",
  "assembly-test-plan",
  "background-orchestration-tier1-upgrades",
  "background-orchestration-tier2-revive",
  "background-orchestration-tier3-wake-jobboard-background-default",
  "background-orchestration-u7-wallclock",
  "cross-session-task-awareness",
  "dcp-background-compression",
  "enforce-plan-tools-only-access",
  "evolution-advancement-proposal",
  "fix-111-architect-start-work-only",
  "fix-open-issues",
  "fix-plan-completion-desync",
  "input-secret-guard-plan",
  "p2.1-trim-hooks",
  "p2.2-generic-recovery-refactor",
  "p2.3-evolution-gating",
  "plan-contract-and-dedicated-tools",
  "setup-standalone-interactive",
  "task-config-consolidation",
  "tdd-enforcement-fix",
  "tiers-to-model-presets",
  "token-audit-fixes",
])

/**
 * True IFF the plan has no front-matter AND its id is on the frozen allowlist.
 *
 * This is deliberately narrower than "any plan lacking front-matter": a new
 * non-allowlisted plan returns `false`.
 */
export function isGrandfathered(filePath: string, content: string): boolean {
  if (parsePlanFrontMatter(content) !== null) return false
  return GRANDFATHER_ALLOWLIST.includes(basename(filePath, ".md"))
}

/**
 * True IFF front-matter is absent, for ANY plan (grandfathered included),
 * because injection is additive. Idempotent: once front-matter is present this
 * returns `false`.
 */
export function shouldMigrate(content: string): boolean {
  return parsePlanFrontMatter(content) === null
}
