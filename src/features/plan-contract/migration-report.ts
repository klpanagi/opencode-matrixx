/**
 * Plan Contract — Migration Dry-Run Report (Task 4)
 *
 * LOCAL-ONLY SEMANTICS: `.matrixx/` is gitignored. Every path scanned and
 * every recommendation below is local to this clone — nothing here is
 * committed, pushed, or shared. Do not treat this report as a repo-wide
 * migration plan.
 *
 * Explicit migration = apply-on-touch ONLY (lifecycle rule 4
 * "Never auto-migrate"): front-matter is added on the next `plan_update`
 * of a touched plan, never via a batch rewrite. This module performs
 * ZERO writes: no `plan_update`, no `renameSync`, no `mkdirSync`, no
 * metadata-comment stripping. It mirrors the `archiveStalePlans`
 * dry-run + collision-skip + never-delete posture from
 * `mission-state/reconcile.ts` — candidates are reported, never moved.
 *
 * dwfinance-class: a plan with zero numbered tasks (design doc /
 * `tasks: []` divergence, `needsTriage`) routes to `archive-candidate`,
 * NEVER to `complete`. Completion requires the Task 2 AND-gate
 * (`isPlanComplete`); an empty plan cannot satisfy it.
 */

import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { PLANS_ARCHIVE_DIR_NAME, PLANS_DIR } from "../mission-state/constants"
import { countPlanProgressFromContent } from "../mission-state/storage"
import { parsePlanFrontMatter } from "./front-matter"
import { classifyPlanLifecycle, type PlanLifecycleState } from "./lifecycle"

/** A recommendation this report is allowed to emit. `complete` is absent by design. */
export type MigrationRecommendation = "apply-on-touch" | "archive-candidate" | "none"

export interface PlanMigrationEntry {
  plan: string
  state: PlanLifecycleState
  progress: { total: number; completed: number }
  hasFrontMatter: boolean
  recommendation: MigrationRecommendation
}

/**
 * Recommend the next step for one scanned plan. Read-only and total.
 * Zero-task plans are `archive-candidate` (dwfinance-class); plans that
 * already carry front-matter need nothing (`none`); everything else waits
 * for apply-on-touch. Never returns `complete`.
 */
export function recommendPlanMigration(
  filePath: string,
  content: string,
): Omit<PlanMigrationEntry, "plan"> {
  const { state } = classifyPlanLifecycle(filePath, content)
  const { total, completed } = countPlanProgressFromContent(content)
  const hasFrontMatter = parsePlanFrontMatter(content) !== null
  if (total === 0) {
    return { state, progress: { total, completed }, hasFrontMatter, recommendation: "archive-candidate" }
  }
  if (hasFrontMatter) {
    return { state, progress: { total, completed }, hasFrontMatter, recommendation: "none" }
  }
  return { state, progress: { total, completed }, hasFrontMatter, recommendation: "apply-on-touch" }
}

/**
 * Scan `<directory>/.matrixx/plans/*.md` (excluding `_archive/`, the
 * designed archival path) and classify each plan via `classifyPlanLifecycle`
 * + `countPlanProgressFromContent` + front-matter parse.
 *
 * DRY-RUN: performs zero writes — files are only read. Returns one entry
 * per plan as a JSON-serializable array.
 */
export function dryRunMigrationReport(directory = process.cwd()): PlanMigrationEntry[] {
  let files: string[]
  try {
    files = readdirSync(join(directory, PLANS_DIR)).filter(
      (f) => f.endsWith(".md") && f !== PLANS_ARCHIVE_DIR_NAME,
    )
  } catch {
    return []
  }
  const out: PlanMigrationEntry[] = []
  for (const file of files) {
    const filePath = join(directory, PLANS_DIR, file)
    let content: string
    try {
      content = readFileSync(filePath, "utf-8")
    } catch {
      continue
    }
    out.push({ plan: basename(file), ...recommendPlanMigration(filePath, content) })
  }
  return out
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const asJson = args.includes("--json")
  if (!dryRun || !asJson) {
    console.error("Usage: migration-report.ts --dry-run --json (read-only; zero writes)")
    process.exit(2)
  }
  const directory = args.find((a) => !a.startsWith("--"))
  console.error(
    "[migration-report] LOCAL-ONLY: .matrixx/ is gitignored; apply-on-touch only (no batch rewrite); zero-task plans route to archive-candidate, never complete.",
  )
  console.log(JSON.stringify(dryRunMigrationReport(directory ?? process.cwd()), null, 2))
}
