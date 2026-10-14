export type ScanSeverity = "warn" | "error"

export interface SilentFailureFinding {
  rule: string
  severity: ScanSeverity
  file: string
  line: number
  excerpt: string
  why: string
  fix: string
  symbol: string
}

export interface SilentFailureSummary {
  filesScanned: number
  total: number
  errors: number
  warnings: number
  byRule: Record<string, number>
  waived: number
  waivedByRule: Record<string, number>
  stale: number
}

export interface SilentFailureScanResult {
  status: 0 | 1 | 2
  findings: SilentFailureFinding[]
  waived: SilentFailureFinding[]
  summary: SilentFailureSummary
  waiverFile?: string
  staleWaivers: SilentFailureWaiver[]
  waiverWarnings: SilentFailureWaiverWarning[]
}

export interface SilentFailureWaiver {
  rule: string
  file: string
  symbol: string
  reason: string
  reviewedAt: string
  owner?: string
}

export interface SilentFailureWaiverWarning {
  kind: "stale" | "invalid-entry" | "load-warning"
  message: string
  entry?: unknown
}
