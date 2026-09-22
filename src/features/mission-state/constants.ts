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

/** HTML comment marker for machine metadata at the end of a plan file */
export const META_TAG_PREFIX = "<!-- plan-persister:"
export const META_TAG_SUFFIX = "-->"

/** Safety cap: max bytes for a single plan file read */
export const MAX_PLAN_FILE_BYTES = 102_400

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
