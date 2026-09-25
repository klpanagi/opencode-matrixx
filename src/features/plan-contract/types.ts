/**
 * Plan Contract Types
 *
 * Structured view of an Oracle work plan: parsed sections, numbered tasks,
 * definition-of-done lines, and optional YAML front-matter.
 */

import type { PlanSection } from "./constants"

export type { PlanSection }

/** A single numbered TODO task parsed from a plan. */
export interface PlanTask {
  /** Task number as written in the plan (e.g. `1` in `- [ ] 1. ...`). */
  n: number
  /** Task title text following the number. */
  title: string
  /** Whether the task checkbox is checked. */
  checked: boolean
  /** 1-based line number of the task within the plan file. */
  line: number
  /** Stable LINE#ID anchor for hashline-scoped edits. */
  anchor: string
}

/** Severity-neutral diagnostic emitted while validating a plan contract. */
export interface PlanContractWarning {
  /** Machine-readable warning code. */
  code: string
  /** Human-readable explanation. */
  message: string
  /** 1-based line the warning refers to, when known. */
  line?: number
}

/** Outcome of validating a plan against the contract. */
export interface PlanContractResult {
  /** True when no errors were produced (warnings may still be present). */
  ok: boolean
  /** Non-fatal contract deviations. */
  warnings: PlanContractWarning[]
  /** Fatal contract violations. */
  errors: string[]
}

/** Lifecycle status carried by a plan's YAML front-matter. */
export type PlanStatus = "pending" | "in_progress" | "completed"

/** Structured YAML front-matter block parsed from a plan file. */
export interface PlanFrontMatter {
  /** Current plan lifecycle status. */
  status: PlanStatus
  /** Monotonic revision counter. */
  revision: number
  /** Execution phase label, when present. */
  phase?: string
  /** Execution wave label, when present. */
  wave?: string
  /** Task ids this plan depends on. */
  deps?: string[]
  /** Task ids blocked by this plan. */
  blockedBy?: string[]
}
