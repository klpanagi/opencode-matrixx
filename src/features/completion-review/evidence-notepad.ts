/**
 * Parser for the machine-written notepads under `.matrixx/notepads/`.
 *
 * This is the PRIMARY evidence source for DoD coverage: these files are written
 * by the `task-notepad-writer` hook, so their presence and their contents are
 * both machine-produced. Nothing in this module touches the filesystem — the
 * caller supplies bytes, which keeps it trivially testable and keeps file
 * creation out of TypeScript.
 *
 * The two markers matched here are the writer's own shapes, imported from its
 * constants rather than re-invented: the durable idempotency key
 * `**Task ID**: <id>` and the `## Completion` stamp appended on terminal status.
 */
import { COMPLETED_STATUS, COMPLETION_SECTION_TITLE } from "../../hooks/task-notepad-writer/constants"

export interface ParsedNotepad {
  /** Value of the `**Task ID**` marker, or null when the marker is absent. */
  taskId: string | null
  /** True only when a `## Completion` stamp carries `status: completed`. */
  completed: boolean
  /** `completed_at` from the stamp, or null when unreadable. */
  completedAt: string | null
}

const TASK_ID_MARKER_RE = /^\*\*Task ID\*\*:\s*(\S+)\s*$/
const COMPLETION_HEADING_RE = new RegExp(`^##\\s*${COMPLETION_SECTION_TITLE.replace(/^#+\s*/, "")}\\s*$`)
const ANY_HEADING_RE = /^#{1,6}\s/
const COMPLETED_AT_RE = /^-\s*completed_at:\s*(\S+)\s*$/
const STATUS_LINE_RE = /^-\s*status:\s*(\S+)\s*$/

/**
 * Parse notepad content into the facts a reviewer needs. Total: any string
 * parses, and a file with neither marker yields `{ taskId: null, completed:
 * false }` rather than throwing — a truncated notepad is missing evidence, not
 * a crash.
 */
export function parseNotepad(content: string): ParsedNotepad {
  let taskId: string | null = null
  let completed = false
  let completedAt: string | null = null
  let inCompletion = false

  for (const line of content.split("\n")) {
    if (!inCompletion) {
      if (COMPLETION_HEADING_RE.test(line)) {
        inCompletion = true
        continue
      }
      if (taskId === null) {
        taskId = line.match(TASK_ID_MARKER_RE)?.[1] ?? null
      }
      continue
    }
    if (ANY_HEADING_RE.test(line)) break
    completedAt = line.match(COMPLETED_AT_RE)?.[1] ?? completedAt
    if (line.match(STATUS_LINE_RE)?.[1] === COMPLETED_STATUS) completed = true
  }

  return { taskId, completed, completedAt }
}
