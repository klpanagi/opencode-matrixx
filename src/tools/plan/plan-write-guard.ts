import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../features/mission-state/constants"
import { atomicWrite } from "../../features/mission-state/plan-storage"
import { PLAN_ERROR_CODES, planSizeExceededFields, planTrimRequiredFields } from "./error-codes"

/**
 * The plan write path's cap guard — the ONLY place a write is measured against
 * the cap and the ONLY place a write is rolled back.
 *
 * `grep -rn "MAX_PLAN_FILE_BYTES" src/tools/plan/plan-update.ts` shows the hashline
 * path and the section-scoped path both arrive here as the same `appliedContent`:
 * a section-scoped edit is resolved to anchors and then written by the same
 * executor. One guard, one rollback, no second copy to drift.
 */

/** `keep` — the applied content is under the cap and must be persisted. */
export interface PlanCapKept {
  kind: "keep"
  bytes: number
}

/** `rolled-back` — over the cap: the original bytes are restored and this is the payload. */
export interface PlanCapExceeded {
  kind: "rolled-back"
  bytes: number
  payload: string
}

export type PlanCapVerdict = PlanCapKept | PlanCapExceeded

export const TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS = 2

const consecutiveSizeRefusals = new Map<string, number>()

export function resetPlanWriteGuardForTesting(): void {
  consecutiveSizeRefusals.clear()
}

/**
 * Runs between "the edit is on disk" and "the cap is enforced" so a fault in
 * that window can be injected. Production passes nothing; the parameter exists
 * so the window is reachable from a test rather than only from a real crash.
 */
export type PostApplyHook = () => void

/**
 * Measure `appliedContent` with the single byte ruler, and roll back to
 * `originalContent` when it is over the cap.
 *
 * The rollback goes through the same tmp+rename `atomicWrite` as the apply, so a
 * crash mid-restore cannot truncate the plan: the target is never written in
 * place, only ever replaced by rename.
 */
export function enforcePlanCap(resolved: string, originalContent: string, appliedContent: string): PlanCapVerdict {
  const bytes = measurePlanBytes(appliedContent)
  const originalBytes = measurePlanBytes(originalContent)
  if (bytes <= MAX_PLAN_FILE_BYTES) {
    consecutiveSizeRefusals.delete(resolved)
    return { kind: "keep", bytes }
  }
  if (bytes < originalBytes) {
    consecutiveSizeRefusals.delete(resolved)
    return { kind: "keep", bytes }
  }
  const count = (consecutiveSizeRefusals.get(resolved) ?? 0) + 1
  consecutiveSizeRefusals.set(resolved, count)
  atomicWrite(resolved, originalContent)
  if (count > TRIM_REQUIRED_AFTER_CONSECUTIVE_REFUSALS) {
    const payload = JSON.stringify({
      error: PLAN_ERROR_CODES.trimRequired,
      ...planTrimRequiredFields(bytes, originalBytes),
      filePath: resolved,
    })
    return { kind: "rolled-back", bytes, payload }
  }
  const payload = JSON.stringify({
    error: PLAN_ERROR_CODES.sizeExceeded,
    ...planSizeExceededFields(bytes),
    filePath: resolved,
  })
  return { kind: "rolled-back", bytes, payload }
}
