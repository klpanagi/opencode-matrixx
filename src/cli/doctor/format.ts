import type { DoctorReport } from "./types"

const STATUS_ICONS: Record<string, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
}

const CATEGORY_ORDER = ["installation", "configuration", "authentication", "dependencies", "tools", "integrations", "updates"]

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length)
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = []
  const boxWidth = 60
  lines.push("")
  lines.push(`┌${"─".repeat(boxWidth - 2)}┐`)
  lines.push(`│${padRight(" Matrixx Doctor", boxWidth - 1)}│`)
  lines.push(`└${"─".repeat(boxWidth - 2)}┘`)
  lines.push("")
  const grouped = new Map<string, typeof report.checks>()
  for (const check of report.checks) {
    const cat = check.category || "other"
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)?.push(check)
  }
  const sortedCategories = [...grouped.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
  for (const category of sortedCategories) {
    const checks = grouped.get(category) ?? []
    lines.push(category.charAt(0).toUpperCase() + category.slice(1))
    for (const c of checks) {
      const icon = STATUS_ICONS[c.status] || "?"
      const label = padRight(`  ${icon} ${c.message}`, boxWidth - 4)
      lines.push(label)
      if (c.detail) {
        const detailLines = c.detail.split("\n")
        for (const dl of detailLines) {
          lines.push(`    ${dl}`)
        }
      }
    }
    lines.push("")
  }
  const s = report.summary
  lines.push(`Summary: ${s.passed} passed, ${s.warnings} warning(s), ${s.failed} failed`)
  if (s.warnings > 0 || s.failed > 0) lines.push("Tip: run with --category <name> --json for filtered output")
  lines.push("")
  return lines.join("\n")
}

export function formatDoctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}
