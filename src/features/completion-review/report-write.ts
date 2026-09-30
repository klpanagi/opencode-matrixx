/**
 * Task 4 — the write path, split out of `report.ts` so the renderer stays pure
 * and small.
 *
 * Two constraints that look opposed, resolved the way
 * `src/features/completion-review/evidence-capture.ts` resolves them:
 *
 * 1. `AGENTS.md` forbids `mkdir`/`writeFileSync`/`mkdirSync` in TypeScript —
 *    file ops belong to the bash tool.
 * 2. A report write must be crash-safe, which means the tmp+rename discipline
 *    of `atomicWrite`.
 *
 * Resolution: this module performs NO filesystem primitives of its own. It
 * REUSES the repo's existing `atomicWrite` — the same primitive every plan
 * write goes through — and exposes `buildReviewDirCommand` so the CALLER
 * creates `.matrixx/reviews/` with the bash tool, exactly as
 * `buildCaptureCommand` hands a shell one-liner to the agent.
 *
 * A crash mid-write leaves no partial report: the target is never written in
 * place, it is only ever REPLACED by a rename of a fully-written temp file. A
 * reader therefore sees either the previous report or the new one, never a
 * truncated mix.
 *
 * This function never opens the PLAN file. Not for reading, not for writing.
 */
import { join } from "node:path"
import { atomicWrite } from "../mission-state/atomic-write"
import { renderReviewReport } from "./report"
import { buildReviewSidecar } from "./report-sidecar"
import type { ReviewInput } from "./report-types"

export const REVIEWS_DIR = ".matrixx/reviews"

/** A shell one-liner for the bash tool. Never executed from TypeScript. */
export function buildReviewDirCommand(directory: string = REVIEWS_DIR): string {
  return `mkdir -p ${JSON.stringify(directory)}`;
}

export function reviewReportPath(planName: string): string {
  return join(REVIEWS_DIR, `${planName}.md`)
}

export function reviewSidecarPath(planName: string): string {
  return join(REVIEWS_DIR, `${planName}.json`)
}

export interface ReviewWriteResult {
  ok: boolean
  reportPath: string
  sidecarPath: string
  /** The markdown as written, so a caller can log or test it without re-reading. */
  markdown: string
  sidecarJson: string
  /** Non-null only when a write failed; the plan is never implicated. */
  error: string | null
}

/**
 * Render and write both artefacts. The markdown and the sidecar are built from
 * the SAME `ReviewInput` in one call, so the two can never disagree about the
 * score — the failure mode of writing them from separate passes.
 */
export function writeReviewReport(input: ReviewInput): ReviewWriteResult {
  const markdown = renderReviewReport(input)
  const sidecarJson = `${JSON.stringify(buildReviewSidecar(input), null, 2)}\n`
  const reportPath = reviewReportPath(input.planName)
  const sidecarPath = reviewSidecarPath(input.planName)

  const reportOk = atomicWrite(reportPath, markdown)
  const sidecarOk = atomicWrite(sidecarPath, sidecarJson)
  const ok = reportOk && sidecarOk

  return {
    ok,
    reportPath,
    sidecarPath,
    markdown,
    sidecarJson,
    error: ok
      ? null
      : `atomic write failed (markdown: ${String(reportOk)}, sidecar: ${String(sidecarOk)}). Did the caller run: ${buildReviewDirCommand()}`,
  }
}