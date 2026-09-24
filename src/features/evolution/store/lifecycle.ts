// Per-file budget: ≤200 LOC (T4a structural split). The retrieval predicate is the
// normative filter contract (T9 consumes it); supersede (T7) and quarantine (T6)
// only expose their owning stubs here.
import type { KnowledgeKind } from "../types"
import { normalizeProjectId } from "./project-identity"

export type ProposalStatus = "pending" | "approved" | "rejected" | "quarantined" | "superseded"

export type RetrievalMeta = {
  status: ProposalStatus
  quarantined?: boolean
  superseded?: boolean
  projectId?: string
  kind?: KnowledgeKind
  tokenCost?: number
}

export type RetrievalScope = {
  projectId?: string
  kinds?: KnowledgeKind[]
  tokenCap?: number
}

/**
 * Normative retrieval contract: approved && !quarantined && !superseded &&
 * projectScope match && kind match && tokenCap.
 */
export function isRetrievable(meta: RetrievalMeta, scope: RetrievalScope): boolean {
  if (meta.status !== "approved") return false
  if (meta.quarantined) return false
  if (meta.superseded) return false
  const scopeProject = normalizeProjectId(scope.projectId)
  const metaProject = normalizeProjectId(meta.projectId)
  if (scopeProject !== metaProject) return false
  if (scope.kinds && scope.kinds.length > 0) {
    if (!meta.kind || !scope.kinds.includes(meta.kind)) return false
  }
  if (scope.tokenCap !== undefined && (meta.tokenCost ?? 0) > scope.tokenCap) return false
  return true
}

/** Quarantine a skill instead of rm -rf. Owned by T6. */
export function quarantineSkill(_slug: string): never {
  throw new Error("quarantineSkill not implemented yet (T6)")
}

/** Supersede with live-head promotion. Owned by T7. */
export function supersedeSkill(_slug: string): never {
  throw new Error("supersedeSkill not implemented yet (T7)")
}
