/**
 * Task 9 — shapes for the calibration corpus.
 *
 * THE CORPUS IS ADVISORY. A report on observed bias may be produced here; acting
 * on it is a human decision. Nothing in this feature — this file included —
 * feeds the corpus back into routing, scoring or any gate, and in particular NOT
 * into the routing-only complexity heuristic or the Seraph gate that heuristic
 * feeds. The sidecar already carries `advisory: true`; these types refuse to
 * describe a corpus as anything else.
 *
 * NO PER-LEVEL GROUPING EXISTS, and the absence is deliberate rather than an
 * unfinished feature. No plan in the corpus stores a `**Complexity**` level
 * (0/35, excluding the completion-review plan files' own prose about the missing
 * line), so a "bias per complexity level" statistic could only be built by
 * SYNTHESISING a level per plan — inventing the very baseline the reader exists
 * to report honestly. Grouping by level waits on the cutover's T12 capture task
 * starting to emit that line. Until then the corpus is a FLAT aggregate.
 *
 * NOTHING HERE COMPUTES A DELTA. A plan-time baseline is an ordinal tier string
 * with no numeric scale, so "under-estimated by 30%" would be a number no plan
 * asserted. Observed facts and verbatim baseline text are placed SIDE BY SIDE and
 * the direction is left to the human reader.
 */
import type { FindingCode } from "./report-types"

/** Below this many samples the corpus is noise, and the report says so. */
export const MIN_SIGNIFICANT_SAMPLE = 10

/**
 * Where a row's data came from. `sidecar` is the normal path; `markdown` exists
 * only so a review written before the sidecar shipped is still COUNTED rather
 * than silently dropped, and a markdown row carries no structured data.
 */
export type CorpusRowSource = "sidecar" | "markdown"

/** One plan's contribution to the corpus, read from its `.json` sidecar. */
export interface CorpusSample {
  plan: string
  source: CorpusRowSource
  /** Verbatim `**Estimated Effort**` text, or `null` when the plan recorded none. */
  effortVerbatim: string | null
  /** Verbatim `**Complexity**` text. `null` for every plan written so far. */
  complexityVerbatim: string | null
  /**
   * The observed text the review recorded, verbatim. It is a STRING because
   * T7's `DIRECTION` forbids reducing an ordinal tier to a number; the corpus
   * therefore groups observed text as text and never sums or subtracts it.
   */
  observedVerbatim: string | null
  /** Finding `code` + `dimensionId` pairs, counted as PAIRS (see the scan module). */
  findingPairs: { code: FindingCode; dimensionId: string }[]
}

/** A file the reader could not use, with the reason. Never dropped in silence. */
export interface CorpusSkippedFile {
  file: string
  reason: string
}

/** A verbatim string and how many plans said it. No level, no order, no rank. */
export interface CorpusVerbatimGroup {
  verbatim: string
  count: number
}

/**
 * One `code`+`dimensionId` pair and its frequency. PAIRS, never bare codes: `E6`
 * is the catch-all for MODEL dimensions and fires once per such dimension, so a
 * bare-code count is dominated by E6 and says nothing.
 */
export interface CorpusFindingPairCount {
  code: FindingCode
  dimensionId: string
  /** Plans in which this pair appeared at least once. */
  count: number
}

export interface CorpusReport {
  /** Plans contributing structured data. Reported beside EVERY statistic below. */
  sampleCount: number
  /** `sampleCount >= MIN_SIGNIFICANT_SAMPLE`. Never inferred from anything else. */
  significant: boolean
  /** Always populated: with `sampleCount` and the threshold, in words. */
  significanceNote: string
  /** Reviews present only as markdown. Counted, but contributing no data. */
  markdownFallbackCount: number
  /** Files the reader could not use, and why. `skipped.length` is the count. */
  skipped: CorpusSkippedFile[]
  /** Verbatim plan-time effort tiers, each with how many plans recorded it. */
  effortTiers: CorpusVerbatimGroup[]
  /**
   * Verbatim complexity tiers. EMPTY today — no plan stores the line. It is
   * reported rather than omitted so the absence is visible, not inferred.
   */
  complexityTiers: CorpusVerbatimGroup[]
  /** The observed text each sidecar recorded, grouped verbatim. */
  observedPhrases: CorpusVerbatimGroup[]
  findingPairs: CorpusFindingPairCount[]
}
