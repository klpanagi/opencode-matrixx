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
