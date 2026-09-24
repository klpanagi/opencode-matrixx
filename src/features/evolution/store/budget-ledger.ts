// Per-file budget: ≤200 LOC (T4a structural split). Pure ledger helpers only —
// file I/O and enforcement of maxCostCentsPerDay / maxCompressionsPerHour is T3.
import * as path from "node:path"
import type { CompressionUsage } from "../types"

export const BUDGET_FILE = ".matrixx/evolution/budget.json"

/** One recorded compression charge. */
export type BudgetEvent = {
  at: string
  inputTokens: number
  outputTokens: number
  costCents: number
}

/** Persisted per-day ledger shape for `.matrixx/evolution/budget.json`. */
export type BudgetLedger = {
  day: string
  spendCents: number
  events: BudgetEvent[]
}

/** UTC calendar-day key (`YYYY-MM-DD`) for an instant. Pure. */
export function utcDayKey(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/** Absolute ledger path for an evolution dir. */
export function budgetPath(evolutionDir: string): string {
  return path.join(evolutionDir, "budget.json")
}

export function emptyLedger(day: string): BudgetLedger {
  return { day, spendCents: 0, events: [] }
}

/** Reset a ledger when the UTC day rolls over. Pure. */
export function rollLedger(ledger: BudgetLedger, day: string): BudgetLedger {
  return ledger.day === day ? ledger : emptyLedger(day)
}

/** Include-inclusive cap check for one more charge. Pure. */
export function withinDailyCap(ledger: BudgetLedger, usage: CompressionUsage, maxCostCentsPerDay: number): boolean {
  return ledger.spendCents + usage.costCents <= maxCostCentsPerDay
}

/** Append a charge to the ledger, rolling the day first. Pure (caller persists). */
export function recordUsage(ledger: BudgetLedger, usage: CompressionUsage, at: Date): BudgetLedger {
  const day = utcDayKey(at)
  const base = rollLedger(ledger, day)
  const event: BudgetEvent = {
    at: at.toISOString(),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costCents: usage.costCents,
  }
  return { day, spendCents: base.spendCents + usage.costCents, events: [...base.events, event] }
}
