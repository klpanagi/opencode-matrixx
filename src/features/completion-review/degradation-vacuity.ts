/**
 * Task 6 — the plan-level `not_scorable` gate: the vacuous-completeness trap
 * and the unfinished-plan rule.
 *
 * Two plan-level causes, checked in a fixed order, and BOTH are terminal for the
 * whole review:
 *
 * 1. **Vacuous completeness** — `needsTriage` is set by
 *    `countPlanProgressFromContent` exactly when `total === 0`
 *    (`src/features/mission-state/storage.ts:187`). It arrives with
 *    `isComplete: true`, so a naive scorer divides completed by total and emits
 *    a perfect 1.0 for a plan that contains nothing at all. `needsTriage` is
 *    therefore consulted BEFORE `isComplete`, not after: reading `isComplete`
 *    first is precisely the bug.
 * 2. **Execution incomplete** — `isComplete: false`. A post-execution reviewer
 *    that scored a still-running plan would emit a partial score, which reads
 *    as a verdict on work nobody finished. There is no partial score.
 *
 * The root cause of (1) is a genuine defect in `storage.ts:186`
 * (`isComplete: total === 0 || completed === total`) and this plan deliberately
 * does NOT repair it: `isComplete` has consumers far outside a review
 * (`src/hooks/architect/event-handler.ts:110-113` clears mission state on it).
 * The fix belongs downstream, here, where the consequence is a number.
 */
import { type NotScorableCause, notScorableReason } from "./degradation-types"
import type { ProgressFacts } from "./gather-types"

/** Which plan-level rule fired, or `null` when the plan may be scored at all. */
export function planGateCause(progress: ProgressFacts): NotScorableCause | null {
  if (progress.needsTriage === true) return "vacuous_completeness"
  if (!progress.isComplete) return "execution_incomplete"
  return null
}

/** True when the plan must not be scored, for any plan-level reason. */
export function isPlanNotScorable(progress: ProgressFacts): boolean {
  return planGateCause(progress) !== null
}

/** The reason text a not_scorable plan carries, or `null` when scorable. */
export function planGateReason(progress: ProgressFacts): string | null {
  const cause = planGateCause(progress)
  return cause === null ? null : notScorableReason(cause)
}
