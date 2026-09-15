import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { getOpenCodeCacheDir } from "./data-path"

/** Canonical default — hook, constants, and schema must all agree on this. */
export const CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS = ["grep", "glob"] as const

export interface ContextModeEnforcement {
  enabled: boolean
  enforce: boolean
  blockedTools: string[]
}

export interface ContextModeConfigInput {
  enabled?: boolean
  enforce?: boolean
  blocked_tools?: string[]
}

/**
 * Single source of truth for context-mode enforcement state.
 * Both the context-mode-enforcer hook (block decision) and the agent prompt
 * builders (guidance text) derive from this — prompt and hook can never
 * disagree because they read the same resolved flags.
 */
export function resolveContextModeEnforcement(
  contextMode: ContextModeConfigInput | undefined,
): ContextModeEnforcement {
  return {
    enabled: contextMode?.enabled ?? true,
    enforce: contextMode?.enforce ?? false,
    blockedTools: (contextMode?.blocked_tools ?? [...CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS]).map((t) =>
      t.toLowerCase(),
    ),
  }
}

/** Exact tool-name match for the raw search tools (mirrors the hook's check). */
export function hasGrepGlobToolNames(toolNames: readonly string[]): boolean {
  return toolNames.some((n) => n === "grep" || n === "glob")
}

/**
 * Whether agent prompts may advertise a grep/glob fallback.
 * Usable = registered AND not blocked. Under enforce:true the hook throws on
 * grep/glob, so the prompt must never offer them — it must name the working
 * substitute (ctx_batch_execute / ctx_execute running `rg`) instead.
 */
export function resolveGrepGlobUsable(toolNames: readonly string[], contextMode?: ContextModeConfigInput): boolean {
  if (!hasGrepGlobToolNames(toolNames)) return false
  const cfg = contextMode !== undefined ? contextMode : _contextModeForPrompts
  return !willBlockGrepGlob(cfg)
}

let _disciplinePathOverride: string | null | undefined 
let _contextModeForPrompts: ContextModeConfigInput | undefined 

export function _setDisciplinePathForTesting(p: string | null | undefined): void {
  _disciplinePathOverride = p
}

export function setContextModeForPrompts(contextMode: ContextModeConfigInput | undefined): void {
  _contextModeForPrompts = contextMode
}

export function getContextModeForPrompts(): ContextModeConfigInput | undefined {
  return _contextModeForPrompts
}

export function _resetContextModeEnforcementForTesting(): void {
  _disciplinePathOverride = undefined
  _contextModeForPrompts = undefined
}

export function willBlockGrepGlob(contextMode: ContextModeConfigInput | undefined): boolean {
  const { enforce, blockedTools } = resolveContextModeEnforcement(contextMode)
  if (!enforce) return false
  if (!(blockedTools.includes("grep") || blockedTools.includes("glob"))) return false
  return hasWorkingSubstitute()
}

export function resolveContextModeDisciplinePath(): string | null {
  if (_disciplinePathOverride !== undefined) return _disciplinePathOverride
  try {
    const resolved = require.resolve("context-mode/configs/opencode/AGENTS.md")
    if (existsSync(resolved)) return resolved
  } catch {}
  try {
    const cacheDir = getOpenCodeCacheDir()
    const p = join(cacheDir, "packages/context-mode@latest/node_modules/context-mode/configs/opencode/AGENTS.md")
    if (existsSync(p)) return p
  } catch {}
  try {
    const base = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache")
    const p = join(base, "opencode/packages/context-mode@latest/node_modules/context-mode/configs/opencode/AGENTS.md")
    if (existsSync(p)) return p
  } catch {}
  try {
    const p2 = join(homedir(), ".cache/opencode/packages/context-mode@latest/node_modules/context-mode/configs/opencode/AGENTS.md")
    if (existsSync(p2)) return p2
  } catch {}
  return null
}

export function hasWorkingSubstitute(): boolean {
  return resolveContextModeDisciplinePath() !== null
}
