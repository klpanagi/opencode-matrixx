// Per-file budget: ≤200 LOC (T4a structural split; T3 added file I/O + enforcement).
// Pure helpers (utcDayKey/budgetPath/emptyLedger/rollLedger/withinDailyCap/recordUsage)
// keep their exact signatures — contract.test.ts asserts them.
import * as fs from "node:fs"
import * as path from "node:path"
import type { CompressionUsage } from "../types"

export const BUDGET_FILE = ".matrixx/evolution/budget.json"

/** Typed capacity breach for the writer's pending queue. */
export class MaxPendingError extends Error {
  readonly pending: number
  readonly maxPending: number

  constructor(pending: number, maxPending: number) {
    super(`evolution pending queue full: ${pending}/${maxPending}`)
    this.name = "MaxPendingError"
    this.pending = pending
    this.maxPending = maxPending
  }
}

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

/** True once recorded spend meets or exceeds the daily cap. */
export function isOverDailyCap(ledger: BudgetLedger, maxCostCentsPerDay: number): boolean {
  return ledger.spendCents >= maxCostCentsPerDay
}

/** Throw MaxPendingError when the pending queue is full. */
export function checkPendingCapacity(pendingCount: number, maxPending: number): void {
  if (pendingCount >= maxPending) throw new MaxPendingError(pendingCount, maxPending)
}

/** Read the persisted ledger, rolling to `now`'s UTC day; fail-open on any error. */
export function loadLedger(evolutionDir: string, now: Date = new Date()): BudgetLedger {
  const day = utcDayKey(now)
  try {
    const parsed = JSON.parse(fs.readFileSync(budgetPath(evolutionDir), "utf-8")) as Partial<BudgetLedger>
    const ledger: BudgetLedger = {
      day: typeof parsed.day === "string" ? parsed.day : day,
      spendCents: typeof parsed.spendCents === "number" ? parsed.spendCents : 0,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    }
    return rollLedger(ledger, day)
  } catch {
    return emptyLedger(day)
  }
}

/** Persist the ledger atomically (tmp + rename), mirroring the repo convention. */
export function saveLedger(evolutionDir: string, ledger: BudgetLedger): void {
  fs.mkdirSync(evolutionDir, { recursive: true })
  const filePath = budgetPath(evolutionDir)
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), "utf-8")
  fs.renameSync(tmp, filePath)
}

/**
 * Load-modify-write a charge. Not locked across processes: concurrent writers
 * follow last-write-wins (a lost charge is acceptable for a single-process
 * plugin). Sequential callers accumulate correctly.
 */
export function recordUsageToDisk(evolutionDir: string, usage: CompressionUsage, at: Date = new Date()): BudgetLedger {
  const next = recordUsage(loadLedger(evolutionDir, at), usage, at)
  saveLedger(evolutionDir, next)
  return next
}
