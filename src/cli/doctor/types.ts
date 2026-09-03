export type CheckStatus = "pass" | "warn" | "fail"

export interface CheckResult {
  name: string
  status: CheckStatus
  message: string
  category?: string
  detail?: string
}
export type CheckCategory =
  | "installation"
  | "configuration"
  | "authentication"
  | "dependencies"
  | "tools"
  | "integrations"
  | "updates"

export interface DoctorCheck {
  name: string
  category: CheckCategory
  check: () => Promise<CheckResult> | CheckResult
}

export interface DoctorReport {
  timestamp: string
  checks: CheckResult[]
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
  }
}
