import { ALL_CHECKS, getChecksByCategory } from "./checks"
import { formatDoctorJson, formatDoctorReport } from "./format"
import type { CheckResult, DoctorReport } from "./types"

export type { CheckCategory, CheckResult, CheckStatus, DoctorCheck, DoctorReport } from "./types"

export interface DoctorOptions {
  category?: string
  json?: boolean
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const checks = options.category ? getChecksByCategory(options.category) : ALL_CHECKS

  if (checks.length === 0) {
    const _available = [...new Set(ALL_CHECKS.map((c) => c.category))]
    return {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: { total: 0, passed: 0, warnings: 0, failed: 0 },
    }
  }

  const results: CheckResult[] = []
  for (const check of checks) {
    try {
      const result = await Promise.resolve(check.check())
      result.category = check.category
      results.push(result)
    } catch (err) {
      results.push({
        name: check.name,
        category: check.category,
        status: "fail",
        message: `Check threw an exception: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  const passed = results.filter((r) => r.status === "pass").length
  const warnings = results.filter((r) => r.status === "warn").length
  const failed = results.filter((r) => r.status === "fail").length

  return {
    timestamp: new Date().toISOString(),
    checks: results,
    summary: { total: results.length, passed, warnings, failed },
  }
}

export async function executeDoctor(options: DoctorOptions = {}): Promise<string> {
  const report = await runDoctor(options)

  if (options.json) {
    return formatDoctorJson(report)
  }

  return formatDoctorReport(report)
}

// Re-export all checks for programmatic use
export { ALL_CHECKS, getCategories, getChecksByCategory } from "./checks"
