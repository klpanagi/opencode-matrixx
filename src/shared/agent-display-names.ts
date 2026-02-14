/**
 * Agent config keys to display names mapping.
 * Config keys are lowercase (e.g., "morpheus", "architect").
 * Display names include suffixes for UI/logs (e.g., "Morpheus (Ultraworker)").
 */
export const AGENT_DISPLAY_NAMES: Record<string, string> = {
  morpheus: "Morpheus (Ultraworker)",
  architect: "Architect (Plan Execution Orchestrator)",
  oracle: "Oracle (Plan Builder)",
  mouse: "Mouse",
  seraph: "Seraph (Plan Consultant)",
  smith: "Smith (Plan Reviewer)",
  merovingian: "merovingian",
  operator: "operator",
  trinity: "trinity",
  construct: "construct",
  cipher: "Cipher (DSL Expert)",
}

/**
 * Get display name for an agent config key.
 * Uses case-insensitive lookup for backward compatibility.
 * Returns original key if not found.
 */
export function getAgentDisplayName(configKey: string): string {
  // Try exact match first
  const exactMatch = AGENT_DISPLAY_NAMES[configKey]
  if (exactMatch !== undefined) return exactMatch
  
  // Fall back to case-insensitive search
  const lowerKey = configKey.toLowerCase()
  for (const [k, v] of Object.entries(AGENT_DISPLAY_NAMES)) {
    if (k.toLowerCase() === lowerKey) return v
  }
  
  // Unknown agent: return original key
  return configKey
}