/**
 * Task 2 — notepad gathering: the best available machine-written evidence trail.
 *
 * Parsing only, never writing. The `**Task ID**` marker and the `## Completion`
 * stamp are read from the SAME constants the `task-notepad-writer` hook writes
 * them with, so a rename on the writer side breaks this reader loudly instead
 * of silently reporting zero corroboration.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import {
  COMPLETION_SECTION_TITLE,
  NOTEPAD_SECTIONS,
  taskIdMarkerLine,
} from "../../hooks/task-notepad-writer/constants"
import type { NotepadRecord } from "./gather-types"

const RESULTS_HEADING = NOTEPAD_SECTIONS.find((section) => section.heading === "## Results")?.heading ?? "## Results"

/** The stamp's own `## Completion` heading, anchored so a body mention cannot count. */
const COMPLETION_HEADING_RE = new RegExp(`^${COMPLETION_SECTION_TITLE}\\s*$`, "m")

function readTaskIdMarker(content: string): string | null {
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("**Task ID**")) continue
    const value = trimmed.slice(trimmed.indexOf(":") + 1).trim()
    return value === "" ? null : value
  }
  return null
}

function hasCompletionStamp(content: string): boolean {
  return COMPLETION_HEADING_RE.test(content)
}

function readResults(content: string): string {
  const lines = content.split("\n")
  const start = lines.findIndex((line) => line.trim() === RESULTS_HEADING)
  if (start === -1) return ""
  const body: string[] = []
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? ""
    if (/^#{1,4}\s/.test(line)) break
    body.push(line)
  }
  return body.join("\n").trim()
}

export function readNotepad(file: string): NotepadRecord | null {
  let content: string
  try {
    content = readFileSync(file, "utf-8")
  } catch {
    return null
  }
  return {
    taskId: readTaskIdMarker(content),
    file: basename(file),
    hasCompletionStamp: hasCompletionStamp(content),
    results: readResults(content),
  }
}

/**
 * Read every notepad in `<notepadDir>/`. A missing directory yields `[]` — the
 * bucket for a plan is only created once a notepad is written, so "no bucket"
 * is the normal case, not an error.
 */
export function gatherNotepads(notepadDir: string): NotepadRecord[] {
  if (!existsSync(notepadDir)) return []
  let files: string[]
  try {
    files = readdirSync(notepadDir).filter((file) => file.endsWith(".md"))
  } catch {
    return []
  }
  const records: NotepadRecord[] = []
  for (const file of files.sort()) {
    const record = readNotepad(join(notepadDir, file))
    if (record !== null) records.push(record)
  }
  return records
}

/** Notepads whose `**Task ID**` marker matches, keyed by that marker. */
export function matchNotepadsByTaskId(records: NotepadRecord[]): Map<string, NotepadRecord> {
  const byId = new Map<string, NotepadRecord>()
  for (const record of records) {
    if (record.taskId !== null && !byId.has(record.taskId)) byId.set(record.taskId, record)
  }
  return byId
}

/** The marker line itself, exported so a test can pin the exact contract. */
export { taskIdMarkerLine }
