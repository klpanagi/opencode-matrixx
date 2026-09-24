// Per-file budget: ≤200 LOC (T4a structural split). Git-derived identity + scoped
// dedup behaviour is T5; only the sentinel + pure normalizer are implemented here.
import { type DistilledKnowledge, UNSCOPED_LEGACY } from "../types"

export { UNSCOPED_LEGACY }

export type ProjectIdentity = {
  projectId: string
  root: string
  remote?: string
}

/** Normalize a missing/empty project id to the unscoped sentinel. Pure. */
export function normalizeProjectId(projectId: string | undefined): string {
  return projectId && projectId.length > 0 ? projectId : UNSCOPED_LEGACY
}

/** Resolve the git identity for a project root. Owned by T5. */
export function resolveProjectIdentity(_root: string): ProjectIdentity {
  throw new Error("resolveProjectIdentity not implemented yet (T5)")
}

/** Scoped dedup key for a distillation. Owned by T5. */
export function dedupKey(_identity: ProjectIdentity, _knowledge: DistilledKnowledge): string {
  throw new Error("dedupKey not implemented yet (T5)")
}
