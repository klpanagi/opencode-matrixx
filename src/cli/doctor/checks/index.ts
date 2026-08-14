import type { DoctorCheck } from "../types"
import { authCheck } from "./auth"
import { configValidationCheck } from "./config"
import { mcpPrerequisitesCheck } from "./mcp"
import { optionalToolsCheck } from "./optional"
import { pluginInstallationCheck } from "./plugin"
import { runtimeDepsCheck } from "./runtime"

export const ALL_CHECKS: DoctorCheck[] = [
  pluginInstallationCheck,
  configValidationCheck,
  authCheck,
  runtimeDepsCheck,
  optionalToolsCheck,
  mcpPrerequisitesCheck,
]

export function getChecksByCategory(category: string): DoctorCheck[] {
  return ALL_CHECKS.filter((c) => c.category === category)
}

export function getCategories(): string[] {
  return [...new Set(ALL_CHECKS.map((c) => c.category))]
}

export { authCheck } from "./auth"
export { configValidationCheck } from "./config"
export { mcpPrerequisitesCheck } from "./mcp"
export { optionalToolsCheck } from "./optional"
export { pluginInstallationCheck } from "./plugin"
export { runtimeDepsCheck } from "./runtime"
