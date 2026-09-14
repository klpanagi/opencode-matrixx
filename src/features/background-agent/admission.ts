import { getParentSessionID } from "../session-state"

/**
 * Whether a background launch originates from the root session or from a
 * managed (subagent) session descended from it. Nested launches are exempt
 * from the concurrency semaphore so a saturated managed child cannot deadlock
 * by waiting on its own background work.
 */
export type AdmissionClass = { kind: "root" } | { kind: "nested"; depth: number }

/**
 * Classify a launch whose requesting session is `parentSessionID`.
 *
 * Walks the child→parent session registry using `getParentSessionID`, treating
 * each registered ancestor hop as one level of nesting. Depth is capped at
 * `maxDepth` and reported as actually reached.
 *
 * Fails open to `root` when the requester is absent from the process-local
 * registry (undefined, empty, or unregistered), so a cold start can never
 * misclassify a root launch as nested.
 */
export function classifyAdmission(parentSessionID: string | undefined, maxDepth: number): AdmissionClass {
  if (!parentSessionID) return { kind: "root" }

  const immediateParent = getParentSessionID(parentSessionID)
  if (!immediateParent) return { kind: "root" }

  let depth = 1
  let current = immediateParent
  while (depth < maxDepth) {
    const parent = getParentSessionID(current)
    if (!parent) break
    depth += 1
    current = parent
  }

  return { kind: "nested", depth }
}
