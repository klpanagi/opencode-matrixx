// Per-file budget: ≤200 LOC (T4a structural split). The retrieval predicate is the
// normative filter contract (T9 consumes it); supersede (T7) and quarantine (T6)
// only expose their owning stubs here.
import * as fs from "node:fs"
import * as path from "node:path"
import type { KnowledgeKind } from "../types"
import { normalizeProjectId } from "./project-identity"
import { EVOLUTION_DIR, TraceStore } from "./trace-store"

export const QUARANTINE_SEGMENT = "quarantine"

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

export type QuarantineOptions = {
  projectRoot?: string
  sourceDir?: string
  reason?: string
}

export type QuarantineResult = {
  quarantined: boolean
  slug: string
  quarantinePath: string
  reason?: string
}

export function promotedDirFor(slug: string, projectRoot: string = process.cwd()): string {
  return path.resolve(projectRoot, ".opencode/skills", slug)
}

export function quarantineDirFor(slug: string, projectRoot: string = process.cwd()): string {
  return path.resolve(projectRoot, EVOLUTION_DIR, QUARANTINE_SEGMENT, slug)
}

async function moveDir(source: string, dest: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  await fs.promises.rm(dest, { recursive: true, force: true })
  try {
    await fs.promises.rename(source, dest)
  } catch {
    await fs.promises.cp(source, dest, { recursive: true })
    await fs.promises.rm(source, { recursive: true, force: true })
  }
}

/** MOVE a promoted skill under `<evolutionDir>/quarantine/<slug>/` and audit it (instead of rm -rf). */
export async function quarantineSkill(slug: string, opts: QuarantineOptions = {}): Promise<QuarantineResult> {
  const projectRoot = opts.projectRoot ?? process.cwd()
  const sourceDir = opts.sourceDir ?? promotedDirFor(slug, projectRoot)
  const quarantinePath = quarantineDirFor(slug, projectRoot)
  let quarantined = false
  try {
    await fs.promises.access(sourceDir)
    await moveDir(sourceDir, quarantinePath)
    quarantined = true
  } catch {
    quarantined = false
  }
  const audit = new TraceStore(path.resolve(projectRoot, EVOLUTION_DIR))
  await audit.appendAudit({ action: "quarantined", slug, reason: opts.reason ?? "low-eval", moved: quarantined })
  return { quarantined, slug, quarantinePath, reason: opts.reason }
}

/** Restore a previously quarantined skill back to the promoted dir. Owned by T6. */
export async function restoreFromQuarantine(
  slug: string,
  opts: { projectRoot?: string; destDir?: string } = {},
): Promise<boolean> {
  const projectRoot = opts.projectRoot ?? process.cwd()
  const source = quarantineDirFor(slug, projectRoot)
  const dest = opts.destDir ?? promotedDirFor(slug, projectRoot)
  try {
    await fs.promises.access(source)
    await moveDir(source, dest)
    return true
  } catch {
    return false
  }
}

/** Supersede with live-head promotion. Owned by T7. */
export function supersedeSkill(_slug: string): never {
  throw new Error("supersedeSkill not implemented yet (T7)")
}
