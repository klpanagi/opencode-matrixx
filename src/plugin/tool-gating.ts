import { existsSync, readdirSync, statSync } from "node:fs"
import { extname, join } from "node:path"

/** Directories never descended into during the bounded startup scan. */
export const TOOL_GATING_SKIP_DIRS: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
]

/** Maximum directory depth visited by the startup scan. */
export const TOOL_GATING_MAX_DEPTH = 4

/** Maximum filesystem entries visited before the scan gives up. */
export const TOOL_GATING_MAX_ENTRIES = 2000

/** File extensions that trigger look_at registration (lowercase, with leading dot). */
export const LOOK_AT_MEDIA_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
]

/** File extension that triggers BDD tool registration. */
export const BDD_FILE_EXTENSION = ".feature"

/** File extension that triggers pdf_extract_figures registration. */
export const PDF_FILE_EXTENSION = ".pdf"

/**
 * Bounded sync scan: true when a file with one of the given extensions exists
 * under the directory. Skips ignored dirs, caps depth and entries, exits early
 * on the first match. Never throws — returns false on any filesystem error.
 */
export function directoryHasMatch(directory: string | undefined, extensions: readonly string[]): boolean {
  if (!directory) return false
  if (extensions.length === 0) return false
  const wanted = new Set(extensions.map((ext) => ext.toLowerCase()))
  let visited = 0
  const stack: Array<{ dir: string; depth: number }> = [{ dir: directory, depth: 0 }]
  try {
    if (!existsSync(directory)) return false
    if (!statSync(directory).isDirectory()) return false
  } catch {
    return false
  }
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || current.depth > TOOL_GATING_MAX_DEPTH) continue
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
    try {
      entries = readdirSync(current.dir, { encoding: "utf8", withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited > TOOL_GATING_MAX_ENTRIES) return false
      if (entry.isDirectory()) {
        if (TOOL_GATING_SKIP_DIRS.includes(entry.name)) continue
        if (current.depth < TOOL_GATING_MAX_DEPTH) {
          stack.push({ dir: join(current.dir, entry.name), depth: current.depth + 1 })
        }
      } else if (entry.isFile()) {
        if (wanted.has(extname(entry.name).toLowerCase())) return true
      }
    }
  }
  return false
}

/** True unless the construct agent is listed in disabled_agents (case-insensitive). */
export function isConstructAgentEnabled(disabledAgents: readonly string[] | undefined): boolean {
  if (!disabledAgents) return true
  return !disabledAgents.some((agent) => agent.toLowerCase() === "construct")
}

/** BDD tools: explicit override wins, otherwise auto iff a *.feature file is found. */
export function shouldEnableBddTools(directory: string | undefined, override: boolean | undefined): boolean {
  if (override !== undefined) return override
  return directoryHasMatch(directory, [BDD_FILE_EXTENSION])
}

/** pdf_extract_figures: explicit override wins, otherwise auto iff a *.pdf file is found. */
export function shouldEnablePdfFigures(directory: string | undefined, override: boolean | undefined): boolean {
  if (override !== undefined) return override
  return directoryHasMatch(directory, [PDF_FILE_EXTENSION])
}

/**
 * look_at: explicit true forces registration (bypasses both gates), explicit
 * false forces skip, otherwise requires construct enabled AND a media file.
 */
export function shouldEnableLookAt(
  directory: string | undefined,
  constructEnabled: boolean,
  override: boolean | undefined,
): boolean {
  if (override !== undefined) return override
  if (!constructEnabled) return false
  return directoryHasMatch(directory, LOOK_AT_MEDIA_EXTENSIONS)
}

/** knowledge_hub_confirm: register iff at least one knowledge hub is configured. */
export function shouldEnableKnowledgeHubConfirm(hubs: readonly unknown[] | undefined): boolean {
  return (hubs ?? []).length > 0
}

/** preset: opt-in only, default false. */
export function shouldEnablePresetTools(override: boolean | undefined): boolean {
  return override ?? false
}
