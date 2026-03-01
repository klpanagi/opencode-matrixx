import { execSync } from "child_process"

import { log } from "../../shared"

export interface GitleaksResult {
  available: boolean
  findings: GitleaksFinding[]
  error?: string
}

export interface GitleaksFinding {
  RuleID: string
  Match: string
  File: string
  StartLine: number
  EndLine: number
  Description: string
}

let gitleaksAvailable: boolean | null = null

function checkGitleaksAvailable(): boolean {
  if (gitleaksAvailable !== null) return gitleaksAvailable
  try {
    execSync("gitleaks version", { stdio: "pipe", timeout: 5000 })
    gitleaksAvailable = true
  } catch {
    gitleaksAvailable = false
    log("[secret-leak-guard] gitleaks not found in PATH — secret scanning disabled")
  }
  return gitleaksAvailable
}

export function runGitleaksStagedScan(cwd: string): GitleaksResult {
  if (!checkGitleaksAvailable()) {
    return { available: false, findings: [] }
  }
  try {
    execSync("gitleaks detect --staged --report-format json --report-path /dev/stdout --no-banner --exit-code 0", {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    })
    return { available: true, findings: [] }
  } catch (err: unknown) {
    return parseGitleaksError(err)
  }
}

export function runGitleaksPrePushScan(cwd: string, remoteBranch: string): GitleaksResult {
  if (!checkGitleaksAvailable()) {
    return { available: false, findings: [] }
  }
  const logOpts = `${remoteBranch}..HEAD`
  try {
    execSync(`gitleaks detect --log-opts="${logOpts}" --report-format json --report-path /dev/stdout --no-banner --exit-code 0`, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    })
    return { available: true, findings: [] }
  } catch (err: unknown) {
    return parseGitleaksError(err)
  }
}

function parseGitleaksError(err: unknown): GitleaksResult {
  const execErr = err as { stdout?: Buffer; stderr?: Buffer; status?: number }
  if (execErr.stdout) {
    try {
      const findings = JSON.parse(execErr.stdout.toString()) as GitleaksFinding[]
      if (Array.isArray(findings) && findings.length > 0) {
        return { available: true, findings }
      }
    } catch {
      // JSON parse failed — treat as non-finding error
    }
  }
  const stderr = execErr.stderr?.toString() ?? ""
  return { available: true, findings: [], error: stderr || "gitleaks exited unexpectedly" }
}
