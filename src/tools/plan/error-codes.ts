import { MAX_PLAN_FILE_BYTES } from "../../features/mission-state/constants"

/**
 * Plan Tool Error-Code Taxonomy (Task 14)
 *
 * Every plan tool failure is reported as `{ error: <code>, message, ... }` where
 * `code` is one of `PLAN_ERROR_CODES`. Codes are DISTINCT conditions — a size
 * refusal never shares a code with a permissions or I/O refusal — so a caller can
 * decide whether to retry, paginate, shrink, or fix its arguments.
 *
 * | code | meaning | retryable |
 * |------|---------|-----------|
 * | `file_not_found` | path does not exist | no |
 * | `invalid_file_path` | failed `validatePlanFilePath` (not `.md`, not kebab, subdirectory, outside `PLANS_DIR`) | no |
 * | `file_too_large` | over `MAX_PLAN_FILE_BYTES` and the requested mode cannot bypass | yes — via pagination/section |
 * | `read_failed` | genuinely unreadable (permissions, I/O, encoding) | maybe |
 * | `validation_error` | a supplied argument is present and invalid | no |
 * | `section_stale` | supplied `contentHash` ≠ recomputed | yes — re-read |
 * | `section_not_found` | selector resolves to nothing | no |
 * | `section_ambiguous` | selector matches >1 candidate | no — disambiguate |
 * | `size_exceeded` | a write would exceed the cap | no — shrink |
 * | `trim_required` | consecutive growing writes refused; same content will keep failing | no same-content — retry only with trimmed/deferred content |
 *
 * RESERVED — declared here, produced by a later task:
 * - `section_stale`, `section_not_found`, `section_ambiguous` — Task 10/15
 *   (section selector + contentHash verification). No producer exists yet; do
 *   not invent one before that task lands.
 *
 * `file_too_large` is also populated by Tasks 15/16 (cap-as-ceiling bypass and
 * the `plan_tasks` degrade path). The codes below are the shared contract.
 */

/**
 * The cap rendered with thousands separators for human-facing prose.
 * Always derived from the single constant — never a hand-written literal — so the
 * message and the hint cannot drift from the value the guard actually enforces.
 */
export function formatPlanCap(cap: number = MAX_PLAN_FILE_BYTES): string {
  return cap.toLocaleString("en-US")
}

/**
 * Shared `message` + `hint` for `size_exceeded`. `plan_create` and `plan_update`
 * reject on mirrored conditions, so both build this from the same function.
 */
export function planSizeExceededFields(actual: number, cap: number = MAX_PLAN_FILE_BYTES): { message: string; hint: string } {
  return {
    message: `Plan exceeds ${cap} bytes — split the plan into smaller plans (${actual}/${cap} bytes)`,
    hint: `Reduce the plan below ${cap.toLocaleString("en-US")} bytes or split it into multiple .matrixx/plans/*.md files.`,
  }
}

/**
 * Recovery hint for `trim_required`: names concrete trim/defer actions, never
 * a bare byte total. Same-content retry is NOT retryable; a retry with smaller
 * (trimmed or deferred) content IS.
 */
export const TRIM_REQUIRED_HINT =
  "Trim required: remove completed phases into the plan's out-of-scope table as deferrals, delete verbose evidence blocks, or move a phase range to a cutover companion; then retry with smaller content. Shrinking writes are still accepted."

/**
 * Shared `message` + `hint` + diagnostics for `trim_required`: `actual` is the
 * refused byte size, `cap` is the enforced cap, `overBy` is how far over the
 * write landed, and `headroom` is the remaining room measured from the
 * pre-write content (negative when the file is already over the cap).
 */
export function planTrimRequiredFields(
  actual: number,
  originalBytes: number,
  cap: number = MAX_PLAN_FILE_BYTES,
): { message: string; hint: string; actual: number; cap: number; overBy: number; headroom: number } {
  return {
    message: `Plan write refused after repeated size refusals — trim or defer scope before retrying (${actual}/${cap} bytes)`,
    hint: TRIM_REQUIRED_HINT,
    actual,
    cap,
    overBy: actual - cap,
    headroom: cap - originalBytes,
  }
}

export const PLAN_ERROR_CODES = {
  fileNotFound: "file_not_found",
  invalidFilePath: "invalid_file_path",
  fileTooLarge: "file_too_large",
  readFailed: "read_failed",
  validationError: "validation_error",
  sectionStale: "section_stale",
  sectionNotFound: "section_not_found",
  sectionAmbiguous: "section_ambiguous",
  sizeExceeded: "size_exceeded",
  trimRequired: "trim_required",
} as const

export type PlanErrorCode = (typeof PLAN_ERROR_CODES)[keyof typeof PLAN_ERROR_CODES]

export const PLAN_ERROR_MEANINGS: Record<PlanErrorCode, string> = {
  file_not_found: "Plan file does not exist.",
  invalid_file_path: "Path rejected by validatePlanFilePath (extension, kebab-case, subdirectory, or outside PLANS_DIR).",
  file_too_large: "Plan file is over MAX_PLAN_FILE_BYTES and the requested mode cannot bypass the cap.",
  read_failed: "Plan file exists but could not be read (permissions, I/O, or encoding).",
  validation_error: "A supplied tool argument is present and invalid.",
  section_stale: "Supplied contentHash does not match the recomputed hash for the section.",
  section_not_found: "Section selector resolved to no matching region.",
  section_ambiguous: "Section selector matched more than one candidate region.",
  size_exceeded: "The resulting write would exceed MAX_PLAN_FILE_BYTES; the write was not persisted.",
  trim_required:
    "Consecutive growing writes to this path were refused for size; retrying the same content will keep failing. Retry only with smaller content (trimmed or deferred).",
}

export const PLAN_ERROR_RETRYABLE: Record<PlanErrorCode, boolean> = {
  file_not_found: false,
  invalid_file_path: false,
  file_too_large: true,
  read_failed: false,
  validation_error: false,
  section_stale: true,
  section_not_found: false,
  section_ambiguous: false,
  size_exceeded: false,
  trim_required: false,
}

/** Recovery hint for `file_too_large`: name a concrete next call, not "split the file". */
export const FILE_TOO_LARGE_HINT =
  "Retry plan_read with offset/limit to page into the file, or with a section selector to read one region; plan_tasks returns the manifest without the body."

/** `{ error, message, hint, filePath, size }` — retryable size refusal. */
export function fileTooLargePayload(filePath: string, size: number, cap: number): string {
  return JSON.stringify({
    error: PLAN_ERROR_CODES.fileTooLarge,
    message: `File exceeds ${cap} bytes (${size}).`,
    hint: FILE_TOO_LARGE_HINT,
    filePath,
    size,
  })
}

/** `{ error, message, filePath }` — genuinely unreadable. Never claims "too large". */
export function readFailedPayload(filePath: string, reason?: string): string {
  return JSON.stringify({
    error: PLAN_ERROR_CODES.readFailed,
    message: `Failed to read ${filePath}${reason ? `: ${reason}` : " (unreadable)"}`,
    filePath,
  })
}

/**
 * Which code a failed plan read should carry.
 * A permissions/IO errno wins over a size reading — an unreadable file is not
 * retryable via pagination, so it must not masquerade as `file_too_large`.
 */
export function classifyReadRefusal(input: {
  sizeOverCap: number | null
  errno: string | null
}): "read_failed" | "file_too_large" {
  if (input.errno !== null) return PLAN_ERROR_CODES.readFailed
  if (input.sizeOverCap !== null) return PLAN_ERROR_CODES.fileTooLarge
  return PLAN_ERROR_CODES.readFailed
}
