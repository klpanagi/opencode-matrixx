// ===== New 3-tier doctor types =====

export type DoctorMode = "default" | "status" | "verbose"

export interface DoctorOptions {
  mode: DoctorMode
  json?: boolean
}

export interface DoctorIssue {
  title: string
  description: string
  fix?: string
  affects?: string[]
  severity: "error" | "warning"
}

export type CheckStatus = "pass" | "fail" | "warn" | "skip"

export interface CheckResult {
  name: string
  status: CheckStatus
  message: string
  details?: string[]
  issues: DoctorIssue[]
  duration?: number
}

type CheckFunction = () => Promise<CheckResult>

export interface CheckDefinition {
  id: string
  name: string
  check: CheckFunction
  critical?: boolean
}

export interface SystemInfo {
  opencodeVersion: string | null
  opencodePath: string | null
  pluginVersion: string | null
  loadedVersion: string | null
  bunVersion: string | null
  configPath: string | null
  configValid: boolean
  isLocalDev: boolean
}

export interface ToolsSummary {
  lspInstalled: number
  lspTotal: number
  astGrepCli: boolean
  astGrepNapi: boolean
  commentChecker: boolean
  ghCli: { installed: boolean; authenticated: boolean; username: string | null }
  mcpBuiltin: string[]
  mcpUser: string[]
}

export interface DoctorSummary {
  total: number
  passed: number
  failed: number
  warnings: number
  skipped: number
  duration: number
}

export interface DoctorResult {
  results: CheckResult[]
  systemInfo: SystemInfo
  tools: ToolsSummary
  summary: DoctorSummary
  exitCode: number
}

// ===== Legacy types (used by existing checks until migration) =====

export interface PluginInfo {
  registered: boolean
  configPath: string | null
  entry: string | null
  isPinned: boolean
  pinnedVersion: string | null
}

type AuthProviderId = "anthropic" | "openai" | "google"

export interface DependencyInfo {
  name: string
  required: boolean
  installed: boolean
  version: string | null
  path: string | null
  installHint?: string
}

export interface LspServerInfo {
  id: string
  installed: boolean
  extensions: string[]
  source: "builtin" | "config" | "plugin"
}

export interface McpServerInfo {
  id: string
  type: "builtin" | "user"
  enabled: boolean
  valid: boolean
  error?: string
}

