/**
 * Plan Tool Constants
 *
 * Barrel only. mission-state owns every plan-storage constant:
 * `PLANS_DIR`, `MAX_PLAN_FILE_BYTES`, `META_TAG_PREFIX`, `META_TAG_SUFFIX`.
 * This file MUST NEVER re-declare them — import the owner instead, so the
 * duplicated cap definition cannot come back.
 * Only the plan-tool-only constants live here.
 */
export {
  MAX_PLAN_FILE_BYTES,
  META_TAG_PREFIX,
  META_TAG_SUFFIX,
  PLANS_DIR,
} from "../../features/mission-state/constants"

export const MAX_PLAN_READ_RENDERED_BYTES = 40_000

export const PLAN_FILENAME_KEBAB_REGEX = /^[a-z0-9-]+\.md$/

export const PLAN_BASENAME_KEBAB_REGEX = /^[a-z0-9-]+$/

