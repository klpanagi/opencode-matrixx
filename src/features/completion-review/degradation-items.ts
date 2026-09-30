/**
 * Task 6 — `unverifiable` is a PER-ITEM outcome, and this is where it collapses.
 *
 * The rule, stated once: a DETERMINISTIC dimension yields a number **iff at least
 * one item is scored**. Items with no evidence are excluded INDIVIDUALLY, and
 * the count of exclusions is reported. If exclusion leaves nothing computable,
 * the dimension degrades to `unscorable` — never to `0`, because a 0 would
 * charge a legacy plan for evidence it never promised to produce.
 *
 * `unverifiable` and `unscorable` are different levels, not synonyms:
 * `unverifiable` is what a DoD ITEM is; `unscorable` is what a DIMENSION becomes
 * when it has no item left to measure. Only the second one touches the weighted
 * mean, by being excluded from it.
 */
import type { DoDEvidence } from "./evidence-types"

/**
 * `unscorable` carries no `score` field. The absence of the key is what makes
 * "never render `unscorable` as 0" a type-checkable claim rather than a habit.
 */
export type CollapsedItems =
  | { kind: "scored"; scored: DoDEvidence[]; excluded: number }
  | { kind: "unscorable"; reason: string; excluded: number }

function reasonFor(excluded: number): string {
  return `no DoD item has machine-written evidence (${excluded} unverifiable)`
}

/**
 * Drop the `unverifiable` items, then decide whether anything is left.
 *
 * An EMPTY input is a different case from an all-`unverifiable` one and is
 * reported with its own wording: a plan that declared no DoD lines is not a plan
 * whose lines went unevidenced, and the report should say which it is.
 */
export function collapseUnverifiable(items: readonly DoDEvidence[]): CollapsedItems {
  if (items.length === 0) {
    return { kind: "unscorable", reason: "plan declares no Definition-of-Done lines", excluded: 0 }
  }
  const scored = items.filter((item) => item.outcome !== "unverifiable")
  const excluded = items.length - scored.length
  if (scored.length === 0) {
    return { kind: "unscorable", reason: reasonFor(excluded), excluded }
  }
  return { kind: "scored", scored, excluded }
}

/** How many items a collapse dropped. Reported, never folded into a 0. */
export function excludedCount(collapsed: CollapsedItems): number {
  return collapsed.excluded
}
