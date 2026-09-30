/// <reference types="bun-types" />
/**
 * Pure corpus/registry helpers for the Plan B BLOCKING PRECONDITION gate
 * (`.matrixx/plans/plan-completion-review.md` Task 1).
 *
 * WHY A SEPARATE MODULE: the positive gate (`precondition.test.ts`) and the
 * NEGATIVE scenario ("run the gate against a plans dir lacking the section
 * registry and assert it FAILS") must evaluate the SAME predicate. A test that
 * only ever runs its own happy path has never failed, so it is not a gate.
 * Both callers import `gateFailures` from here.
 *
 * NOTHING IS REIMPLEMENTED: section resolution is delegated to
 * `resolveSectionSelector` (the shipped registry) and spans to `buildSectionIndex`
 * (the shipped section index). This module only COUNTS and COMPARES.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { type SectionRegistryEntry } from "../../../src/features/plan-contract/section-registry"
import type { CorpusStats } from "./precondition-corpus"
import { measurePlans, type PlanSource } from "./precondition-corpus"

export { RUBRIC_H3_IDS, RUBRIC_H3_SELECTORS } from "./precondition-corpus"
import { RUBRIC_H3_IDS } from "./precondition-corpus"

/**
 * Corpus-size floor each rubric H3 must clear.
 *
 * Live corpus (36 plans) resolves 31 / 28 / 27 of the three rubric H3s, so the
 * binding constraint is `test-decision` at 27. The plan text quotes
 * "25/35" for it, which is close but was written against a smaller corpus.
 *
 * The floor is 20, chosen on two grounds:
 *
 * (1) It must sit BELOW the smallest observed value with real headroom, because
 *     a plan is archived far more often than a registry entry is deleted. At 25
 *     the margin on `test-decision` is 2 — archiving two completed plans would
 *     fail the build for a reason that has nothing to do with the section
 *     surface. That is a brittle gate, not a strict one. At 20 the margin is 7:
 *     roughly a quarter of the corpus may be archived before the gate fires.
 *
 * (2) It must still be far above a real regression. The failure this gate exists
 *     to catch is a registry that stopped resolving H3s at all, which lands
 *     every selector at 0. 20 is nowhere near 0, so that signal is unaffected.
 *
 * 20 is therefore ~74% of the binding observation (27) — loose enough to
 * tolerate archiving, tight enough that any genuine resolution regression still
 * fails immediately.
 *
 * THE CORPUS IS NOW COMMITTED FIXTURES, not the live `.matrixx/plans/`
 * directory: that directory is gitignored, so measuring it made this gate green
 * only on the machine that wrote it. The floor stays 20 because the committed
 * corpus (`tests/fixtures/completion-review/corpus-plans.ts`, 32 plans resolving
 * all three H3s) clears it, and because the regression this gate exists to
 * catch — a registry that resolves none of the three — lands every selector at
 * 0, nowhere near 20. The floor was NOT lowered to fit the fixtures; the
 * fixture corpus was sized to clear the floor. 12 of the 32 slots may be lost
 * before the gate fires.
 */
export const MIN_CORPUS_RESOLUTIONS = 20

/**
 * Read a plans directory into plan sources and measure it.
 *
 * A thin directory reader kept only for callers that genuinely have a corpus on
 * disk. The gate's own assertions run against committed fixtures via
 * `measurePlans`; nothing in the gate may depend on this.
 */
export function measureCorpus(
  plansDir: string,
  entries?: readonly SectionRegistryEntry[],
): CorpusStats {
  const plans: PlanSource[] = readdirSync(plansDir)
    .filter((name) => name.endsWith(".md") && statSync(join(plansDir, name)).isFile())
    .sort()
    .map((name) => ({ name, content: readFileSync(join(plansDir, name), "utf-8") }))
  return measurePlans(plans, entries)
}


/**
 * The gate itself. Returns the list of FAILURES; an empty list means the gate
 * HOLDS. Deliberately returns strings rather than throwing so the negative
 * scenario can assert on the failure text.
 */
export function gateFailures(stats: CorpusStats): string[] {
  const failures: string[] = []
  for (const id of RUBRIC_H3_IDS) {
    const bucket = stats.bySelector[id]
    if (bucket.ambiguous > 0) {
      failures.push(`${id}: ${bucket.ambiguous} ambiguous resolutions`)
    }
    if (bucket.resolvedNonEmpty < MIN_CORPUS_RESOLUTIONS) {
      failures.push(
        `${id}: only ${bucket.resolvedNonEmpty}/${stats.planCount} plans resolve to a non-empty body (need >= ${MIN_CORPUS_RESOLUTIONS})`,
      )
    }
  }
  if (stats.h3Total <= stats.h2Total) {
    failures.push(
      `H3 corpus coverage (${stats.h3Total}) does not exceed H2 (${stats.h2Total}) — the section surface was not widened past H2`,
    )
  }
  if (stats.h3Resolved <= stats.h3Custom) {
    failures.push(
      `resolvable H3s (${stats.h3Resolved}) do not exceed the custom fallback (${stats.h3Custom})`,
    )
  }
  return failures
}
