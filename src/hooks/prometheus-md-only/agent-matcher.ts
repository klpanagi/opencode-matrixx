import { PROMETHEUS_AGENT } from "./constants"

export function isOracleAgent(agentName: string | undefined): boolean {
  return agentName?.toLowerCase().includes(PROMETHEUS_AGENT) ?? false
}
