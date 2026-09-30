/**
 * Task 9 — reading one review directory into corpus samples.
 *
 * THE SIDECAR IS THE DATA; THE MARKDOWN IS THE HUMAN ARTEFACT. A `<plan>.json`
 * is always preferred, and a `<plan>.md` is consulted only when its sidecar is
 * absent. A markdown fallback contributes a COUNT and nothing else: parsing
 * prose to recover numbers is exactly the contract that breaks on the first
 * reworded sentence, so the fallback deliberately has no parser.
 *
 * A MISSING OR UNPARSEABLE SIDECAR IS COUNTED, NEVER SKIPPED IN SILENCE. A
 * reader that quietly drops bad files makes its own sample count a lie, and the
 * sample count is the entire honesty property of this task. Every file that
 * cannot be used lands in `skipped` with the reason.
 *
 * No filesystem mutation happens here: the caller creates `.matrixx/reviews/`
 * with the bash tool, via T4's `buildReviewDirCommand`.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CorpusRowSource, CorpusSample, CorpusSkippedFile } from "./calibration-corpus-types"
import type { FindingCode, ReviewSidecar } from "./report-types"
import { REVIEW_SIDECAR_VERSION } from "./report-types"

export interface CorpusScanResult {
  samples: CorpusSample[]
  skipped: CorpusSkippedFile[]
  markdownFallbackCount: number
}

const FINDING_CODES: readonly string[] = ["E1", "E2", "E3", "E4", "E5", "E6"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

/**
 * Structural guard on the sidecar. The version is checked FIRST and separately:
 * an unknown version is a refusal, not a partial read, because a reader that
 * guesses at a shape it does not understand is how a corpus quietly fills with
 * numbers nobody produced.
 */
export function isReviewSidecar(value: unknown): value is ReviewSidecar {
  if (!isRecord(value)) return false
  if (value.sidecarVersion !== REVIEW_SIDECAR_VERSION) return false
  if (typeof value.plan !== "string") return false
  if (!isRecord(value.effort) || !isStringOrNull(value.effort.planned)) return false
  if (!isRecord(value.complexity) || !isStringOrNull(value.complexity.planned)) return false
  if (!isStringOrNull(value.effort.observed)) return false
  if (!Array.isArray(value.findings)) return false
  return value.findings.every(
    (f) => isRecord(f) && FINDING_CODES.includes(String(f.code)) && typeof f.dimensionId === "string",
  )
}

function sidecarSample(sidecar: ReviewSidecar, source: CorpusRowSource): CorpusSample {
  return {
    plan: sidecar.plan,
    source,
    effortVerbatim: sidecar.effort.planned,
    complexityVerbatim: sidecar.complexity.planned,
    observedVerbatim: sidecar.effort.observed,
    findingPairs: sidecar.findings.map((f) => ({ code: f.code as FindingCode, dimensionId: f.dimensionId })),
  }
}

function pairKey(file: string): string {
  return file.replace(/\.(json|md)$/, "")
}

/**
 * Read every review in `directory`. Non-existent directory yields an EMPTY
 * result rather than an error — "no reviews yet" is a legitimate corpus state,
 * and a reader that throws on it cannot be called before the first review.
 */
export function scanReviewDirectory(directory: string): CorpusScanResult {
  const scan: CorpusScanResult = { samples: [], skipped: [], markdownFallbackCount: 0 }
  let entries: string[]
  try {
    entries = readdirSync(directory)
  } catch {
    return scan
  }

  const names = entries.filter((f) => /\.(json|md)$/.test(f)).sort()
  for (const jsonFile of names.filter((f) => f.endsWith(".json"))) {
    const mdFile = `${pairKey(jsonFile)}.md`
    let raw: string
    try {
      raw = readFileSync(join(directory, jsonFile), "utf8")
    } catch (error) {
      scan.skipped.push({ file: jsonFile, reason: `unreadable sidecar: ${describe(error)}` })
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      scan.skipped.push({ file: jsonFile, reason: `sidecar is not valid JSON: ${describe(error)}` })
      continue
    }
    if (!isReviewSidecar(parsed)) {
      scan.skipped.push({ file: jsonFile, reason: `sidecar is not a version ${REVIEW_SIDECAR_VERSION} review sidecar` })
      continue
    }
    scan.samples.push(sidecarSample(parsed, "sidecar"))
    if (names.includes(mdFile)) {
      scan.skipped.push({
        file: mdFile,
        reason: "markdown present alongside a readable sidecar; the sidecar is the data and the markdown was not parsed",
      })
    }
  }

  for (const mdFile of names.filter((f) => f.endsWith(".md"))) {
    if (names.includes(`${pairKey(mdFile)}.json`)) continue
    scan.markdownFallbackCount += 1
    scan.samples.push({
      plan: pairKey(mdFile),
      source: "markdown",
      effortVerbatim: null,
      complexityVerbatim: null,
      observedVerbatim: null,
      findingPairs: [],
    })
  }
  return scan
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
