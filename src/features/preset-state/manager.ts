import { log } from "../../shared/logger"

const HOOK_NAME = "preset-state"

/**
 * Session-scoped active preset overrides.
 *
 * Maps an OpenCode session ID to the preset name currently active for that
 * session. Values are stored blindly — callers are responsible for validating
 * that the preset name exists in the config. Cleared on session end via the
 * `event` hook (session.deleted), mirroring session-state/assembly-state.
 */
const presetBySession = new Map<string, string>()

export function setSessionPreset(sessionID: string, presetName: string): void {
  presetBySession.set(sessionID, presetName)
  log(`[${HOOK_NAME}] Preset set for session`, { sessionID, presetName })
}

export function getSessionPreset(sessionID: string): string | undefined {
  return presetBySession.get(sessionID)
}

export function clearSessionPreset(sessionID: string): void {
  presetBySession.delete(sessionID)
  log(`[${HOOK_NAME}] Preset cleared for session`, { sessionID })
}

/** @internal */
export function _resetPresetStateForTesting(): void {
  presetBySession.clear()
}