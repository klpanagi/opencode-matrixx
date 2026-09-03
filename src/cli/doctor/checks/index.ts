import type { DoctorCheck } from "../types"
import { authCheck } from "./auth"
import { configValidationCheck } from "./config"
import { contextModeCheck } from "./context-mode"
import { dcpCheck } from "./dcp"
import { dockerCheck } from "./docker"
import { headroomCheck } from "./headroom"
import { mcpPrerequisitesCheck } from "./mcp"
import { optionalToolsCheck } from "./optional"
import { pluginInstallationCheck } from "./plugin"
import { rtkCheck } from "./rtk"
import { runtimeDepsCheck } from "./runtime"
import { tmuxCheck } from "./tmux"

export const ALL_CHECKS: DoctorCheck[] = [
  pluginInstallationCheck,
  configValidationCheck,
  authCheck,
  runtimeDepsCheck,
  optionalToolsCheck,
  mcpPrerequisitesCheck,
  headroomCheck,
  rtkCheck,
  dcpCheck,
  contextModeCheck,
  tmuxCheck,
  dockerCheck,
]

export function getChecksByCategory(category: string): DoctorCheck[] {
  return ALL_CHECKS.filter((c) => c.category === category)
}

export function getCategories(): string[] {
  return [...new Set(ALL_CHECKS.map((c) => c.category))]
}

export { authCheck } from "./auth"
export { configValidationCheck } from "./config"
export { contextModeCheck } from "./context-mode"
export { dcpCheck } from "./dcp"
export { dockerCheck } from "./docker"
export { headroomCheck } from "./headroom"
export { mcpPrerequisitesCheck } from "./mcp"
export { optionalToolsCheck } from "./optional"
export { pluginInstallationCheck } from "./plugin"
export { rtkCheck } from "./rtk"
export { runtimeDepsCheck } from "./runtime"
export { tmuxCheck } from "./tmux"
