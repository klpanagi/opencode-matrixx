import type { McpCreationFailure } from "./mcp-validator"

let startupFailures: McpCreationFailure[] = []

export function setMcpStartupFailures(failures: McpCreationFailure[]): void {
  startupFailures = failures
}

export function getMcpStartupFailures(): McpCreationFailure[] {
  return startupFailures
}

export function _resetMcpStartupFailuresForTesting(): void {
  startupFailures = []
}
