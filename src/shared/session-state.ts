/**
 * Per-session temperature overrides.
 *
 * Before prompting a subagent session, store the desired temperature here.
 * The category-temperature chat.params hook reads this store and injects
 * the value into the LLM call parameters.
 */
const temperatureBySession = new Map<string, number>()

export function setSessionTemperature(sessionID: string, temperature: number): void {
  temperatureBySession.set(sessionID, temperature)
}

export function getSessionTemperature(sessionID: string): number | undefined {
  return temperatureBySession.get(sessionID)
}

export function clearSessionTemperature(sessionID: string): void {
  temperatureBySession.delete(sessionID)
}

/**
 * Per-session tool availability overrides.
 */
const toolsBySession = new Map<string, Record<string, boolean>>()

export function setSessionTools(sessionID: string, tools: Record<string, boolean>): void {
  toolsBySession.set(sessionID, { ...tools })
}

export function getSessionTools(sessionID: string): Record<string, boolean> | undefined {
  const tools = toolsBySession.get(sessionID)
  return tools ? { ...tools } : undefined
}

export function clearSessionTools(): void {
  toolsBySession.clear()
}

/**
 * Per-session model tracking.
 */
type SessionModel = { providerID: string; modelID: string }

const sessionModels = new Map<string, SessionModel>()

export function getSessionModel(sessionID: string): SessionModel | undefined {
  return sessionModels.get(sessionID)
}
