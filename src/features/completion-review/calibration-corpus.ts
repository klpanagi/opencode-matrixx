/**
 * Task 9 — the calibration-corpus reader: a corpus of estimate accuracy.
 *
 * WHAT THIS IS FOR. One review's estimate comparison is noise. Many of them show
 * where the plan-generation heuristic runs wide — and the signal is about the
 * PLAN GENERATOR, not the executor. This reader aggregates T7's calibration
 * comparisons across every review in a directory into that corpus.
 *
 * THE CORPUS IS ADVISORY. A report on observed bias may be produced; ACTING ON IT
 * IS A HUMAN DECISION. Nothing here feeds back into anything automatically: no
 * gate, no auto-tuning, no routing, no scoring, and specifically NOT into the
 * routing-only complexity heuristic or the Seraph gate that heuristic feeds. The
 * reader has no output parameter, no callback and no write path — it is a pure
 * read that returns an object a human reads. A corpus that could steer the
 * heuristic would be measuring it with its own output, and the first person to
 * wire it up would not notice the loop.
 *
 * THE SIDECAR IS THE DATA; THE MARKDOWN IS THE HUMAN ARTEFACT. `<plan>.json` is
 * read preferentially and `<plan>.md` only as a fallback, which counts the plan
 * and parses nothing. Prose is never the primary source.
 *
 * THE SAMPLE COUNT IS THE HONESTY PROPERTY. Every statistic here travels with
 * `sampleCount`, and under the significance threshold the report says in words
 * that it is not a finding. Three reviews are three anecdotes.
 *
 * NO PER-LEVEL GROUPING. No plan in the corpus stores a `**Complexity**` level
 * (0/35, excluding the completion-review plan files' own prose about the missing
 * line), so a per-level bias could only be produced by synthesising a level per
 * plan. Grouping by level waits on the cutover's T12 capture task emitting that
 * line; until then `complexityTiers` is reported empty rather than implied.
 *
 * NO DELTA, EVER. A plan-time baseline is an ordinal tier with no numeric scale,
 * so "under-estimated by 30%" would be a number no plan asserted. Observed text
 * and verbatim baseline are placed side by side; the direction is the human's.
 */
import { aggregateCorpus } from "./calibration-corpus-aggregate"
import { scanReviewDirectory } from "./calibration-corpus-scan"
import type { CorpusReport } from "./calibration-corpus-types"
import { REVIEWS_DIR } from "./report-write"

export type {
  CorpusFindingPairCount,
  CorpusReport,
  CorpusRowSource,
  CorpusSample,
  CorpusSkippedFile,
  CorpusVerbatimGroup,
} from "./calibration-corpus-types"
export { MIN_SIGNIFICANT_SAMPLE } from "./calibration-corpus-types"

/** Read a reviews directory and aggregate it. A missing directory yields an empty corpus. */
export function readCalibrationCorpus(reviewsDir: string = REVIEWS_DIR): CorpusReport {
  const scan = scanReviewDirectory(reviewsDir)
  return aggregateCorpus(scan.samples, scan.skipped, scan.markdownFallbackCount)
}
