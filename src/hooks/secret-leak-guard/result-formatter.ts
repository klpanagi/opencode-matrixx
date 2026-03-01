import type { GitleaksFinding } from "./gitleaks-runner"

export function formatFindings(findings: GitleaksFinding[]): string {
  return findings
    .map((f, i) => {
      const location = `${f.File}:${f.StartLine}`
      const rule = f.RuleID || "unknown-rule"
      const desc = f.Description || f.Match?.slice(0, 40) || "secret detected"
      return `  ${i + 1}. [${rule}] ${location} — ${desc}`
    })
    .join("\n")
}

const REMOTE_BRANCH_PATTERN = /\bgit\s+push\s+\S+\s+(\S+)/

export function extractRemoteBranch(command: string): string {
  const match = command.match(REMOTE_BRANCH_PATTERN)
  return match?.[1] ?? "origin/dev"
}
