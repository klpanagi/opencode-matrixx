/**
 * Plan Contract — Appendix Boundary (thin compat wrapper).
 *
 * The region-bound MACHINERY now lives in `./region` as the general
 * `findNamedRegion` / `collectNamedRegions` primitive, which
 * `src/tools/plan/section-index.ts` shares. This file keeps the single
 * advisory naming of one region: the appendix.
 *
 * DO NOT "CLEAN UP" THIS WRAPPER. The appendix CONCEPT is advisory, not
 * load-bearing: 0 of the 35 corpus plans carry an exact `## Appendix` H2, and
 * the corpus spells it `## Appendix: Extra Notes`, which the exact-match rule
 * below deliberately does NOT accept. It is retained for two reasons only:
 *   1. BACKWARD COMPATIBILITY — `validate.ts:147` calls it to exempt headings
 *      at/after the appendix from canonical-section and ordering checks, and
 *      that call site must keep working unchanged.
 *   2. PLANS AUTHORED TO THE ORACLE SKELETON — `renderPlanSkeleton` emits the
 *      heading, so a hand-authored plan can still place material there.
 * The exemption stays ADVISORY (a warning, never an `errors.push`); a plan with
 * no appendix is perfectly valid, which is why this returns `-1` rather than
 * failing.
 *
 * Pure content-level helper — accepts a string only, never touches the file system.
 */
import { findNamedRegion } from "./region"

export {
  collectNamedRegions,
  findNamedRegion,
  type NamedRegion,
  type RegionStart,
  type RegionStartPredicate,
} from "./region"

/**
 * Return the ZERO-BASED line index of the first `## Appendix` H2, or `-1` when
 * the plan has no appendix. "Normalized" means the heading text is trimmed.
 *
 * The value is UNCHANGED from the pre-generalization implementation, and this
 * function is the ONLY place that converts the primitive's 1-based
 * `startIndex` into a 0-based index — every other consumer works in 1-based
 * line numbers, matching `PlanSectionIndexEntry`.
 */
export function findAppendixStart(content: string): number {
  // `level === 2` keeps the H2-only rule the original open-coded `H2_RE` had;
  // the exact text match keeps its rejection of "Appendix: Extra Notes".
  const region = findNamedRegion(
    content,
    (heading) => heading.level === 2 && heading.text.trim() === "Appendix",
  )
  return region === null ? -1 : region.startIndex - 1
}
