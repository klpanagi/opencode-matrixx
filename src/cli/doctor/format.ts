import type { DoctorReport } from "./types"

const STATUS_ICONS: Record<string, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
}

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

  // Group by category
  const grouped = new Map<string, typeof report.checks>()
  for (const check of report.checks) {
    const cat = check.name.split("-")[0] || "other"
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)?.push(check)
  }

  for (const [category, checks] of grouped) {
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
  lines.push("")

  return lines.join("\n")
}

export function formatDoctorJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2)
}
