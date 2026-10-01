/**
 * Mission State Constants
 */

export const MISSION_DIR = ".matrixx"
export const MISSION_FILE = "mission.json"

/** Oracle planner plan directory pattern */
export const ORACLE_PLANS_DIR = ".matrixx/plans"

/**
 * Plan Persistence Constants
 */

/** Relative path from project root to plans directory */
export const PLANS_DIR = ".matrixx/plans"

/** Subdir of PLANS_DIR holding archived stale plans; excluded from listings. */
export const PLANS_ARCHIVE_DIR_NAME = "_archive"

/** Default staleness window (hours) shared by task + plan archival. */
export const DEFAULT_STALE_AFTER_HOURS = 24

/** HTML comment marker for machine metadata at the end of a plan file */
export const META_TAG_PREFIX = "<!-- plan-persister:"
export const META_TAG_SUFFIX = "-->"

/** Safety cap: max bytes for a single plan file read */
export const MAX_PLAN_FILE_BYTES = 140_000

/**
 * Resolve the effective plan file cap from plugin config, falling back to
 * `MAX_PLAN_FILE_BYTES` when unset. Mirrors the
 * `cfg?.detection?.max_scan_bytes ?? 64*1024` fallback pattern.
 */
export function resolvePlanCap(config?: { plans?: { max_plan_file_bytes?: number } } | undefined): number {
  return config?.plans?.max_plan_file_bytes ?? MAX_PLAN_FILE_BYTES
}

/**
 * The single byte ruler for plan content.
 *
 * Every plan size limit compared against this value (`MAX_PLAN_FILE_BYTES`,
 * `MAX_PLAN_READ_RENDERED_BYTES`, the plan-contract size cap) is a TRUE UTF-8
 * byte limit — never a UTF-16 code-unit (`.length`) count. A `.length` ruler
 * undercounts CJK/emoji content by up to 3x and silently reports compliance.
 */
export function measurePlanBytes(content: string): number {
  return Buffer.byteLength(content, "utf8")
}

/**
 * Plan Checkbox Patterns
 *
 * Single source of truth for plan progress counting (see getPlanProgress).
 * All patterns are anchored to column 0: indented sub-checkboxes
 * (acceptance criteria, Definition-of-Done nests) never count.
 * Do NOT inline checkbox regexes elsewhere — import these instead.
 */

/** Top-level unchecked box: `- [ ]` or `* [ ]` */
export const TOP_UNCHECKED_RE = /^[-*]\s*\[\s*\]/gm
/** Top-level checked box: `- [x]` / `- [X]` (case-insensitive) */
export const TOP_CHECKED_RE = /^[-*]\s*\[[xX]\]/gm
/** Numbered unchecked task (Oracle format): `- [ ] 1. Task` */
export const NUMBERED_UNCHECKED_RE = /^[-*]\s*\[\s*\]\s*\d+\./gm
/** Numbered checked task (Oracle format): `- [x] 2. Task` */
export const NUMBERED_CHECKED_RE = /^[-*]\s*\[[xX]\]\s*\d+\./gm
