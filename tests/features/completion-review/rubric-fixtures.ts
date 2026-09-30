/// <reference types="bun-types" />
import type { AttributionFacts, DriftFacts, ProgressFacts as _ProgressFacts } from "../../../src/features/completion-review/gather-types"

export type ProgressFacts = _ProgressFacts
export type { AttributionFacts, DriftFacts }

/** Counters a dimension reports alongside its 0..1 score. */
export interface DimensionSignals {
  allPass?: boolean
  avgPass?: number
  gap?: number
  dodTotal?: number
  passed?: number
  failed?: number
  unverifiable?: number
  matchedDeliverables?: number
  declaredDeliverables?: number
  plannedTdd?: boolean
  tddMarkedTests?: number
  testFiles?: number
  [key: string]: number | boolean | string | undefined
}
