// Per-file budget: ≤200 LOC (T4a structural split). Git-derived identity + scoped
// dedup. `remote` is IN-MEMORY ONLY — never persisted, never logged; only the
// `projectId` hash is safe to store.
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { type DistilledKnowledge, UNSCOPED_LEGACY } from "../types"

export { UNSCOPED_LEGACY }

export type ProjectIdentity = {
  projectId: string
  root: string
  remote?: string
}

/** Injectable git runner: returns trimmed stdout, or null when the command fails. */
export type GitRunner = (args: string[], cwd: string) => string | null

const ID_PREFIX = "sha256:"

/** Normalize a missing/empty project id to the unscoped sentinel. Pure. */
export function normalizeProjectId(projectId: string | undefined): string {
  return projectId && projectId.length > 0 ? projectId : UNSCOPED_LEGACY
}

/** Lowercase, trim, collapse runs of non-alphanumerics to a single dash. Pure. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function canonicalize(root: string): string {
  try {
    return fs.realpathSync(root)
  } catch {
    return path.resolve(root)
  }
}

function defaultGitRunner(args: string[], cwd: string): string | null {
  try {
    const res = spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 5000 })
    if (res.status !== 0) return null
    const out = (res.stdout ?? "").trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

const identityCache = new Map<string, ProjectIdentity>()

/** Drop the memoized identities (test hook + explicit invalidation). */
export function clearProjectIdentityCache(): void {
  identityCache.clear()
}

/** Short, stable project suffix used to disambiguate cross-project slugs. Pure. */
export function projectSlugSuffix(projectId: string): string {
  return sha256Hex(normalizeProjectId(projectId)).slice(0, 8)
}

/**
 * Resolve the git identity for a project root. The id is `sha256:<hex>` of the
 * git remote URL when one exists, otherwise of the canonical repo-root path.
 * Results are memoized per canonical root: a second resolve for the same root
 * spawns no git. `remote` is returned for in-memory use only — callers MUST NOT
 * persist or log it.
 */
export function resolveProjectIdentity(root: string, runner: GitRunner = defaultGitRunner): ProjectIdentity {
  const canonicalRoot = canonicalize(root)
  const cached = identityCache.get(canonicalRoot)
  if (cached) return cached

  const remote =
    runner(["remote", "get-url", "origin"], canonicalRoot) ??
    runner(["config", "--get", "remote.origin.url"], canonicalRoot) ??
    undefined
  const repoRoot = runner(["rev-parse", "--show-toplevel"], canonicalRoot) ?? canonicalRoot
  const projectId = `${ID_PREFIX}${sha256Hex(remote ?? canonicalize(repoRoot))}`

  const identity: ProjectIdentity = remote
    ? { projectId, root: canonicalRoot, remote }
    : { projectId, root: canonicalRoot }
  identityCache.set(canonicalRoot, identity)
  return identity
}

/** Scoped dedup key: projectId + kind + normalized title. Owned by T5. */
export function dedupKey(identity: ProjectIdentity, knowledge: DistilledKnowledge): string {
  return `${normalizeProjectId(identity.projectId)}|${knowledge.kind}|${normalizeTitle(knowledge.title)}`
}
