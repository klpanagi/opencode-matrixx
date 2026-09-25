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
