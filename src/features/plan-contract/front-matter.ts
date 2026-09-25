/**
 * Plan Front-Matter
 *
 * Structured YAML front-matter (a leading `---` fenced block) for Oracle plan
 * files, parsed with `js-yaml`.
 *
 * PRECEDENCE: when a front-matter block is present it is authoritative for
 * `status` and `revision`. The legacy `<!-- plan-persister: {...} -->` comment
 * (see mission-state `plan-storage.ts`) remains authoritative for `todoTotal`,
 * `todoCompleted`, `updatedAt` and `sessionId`, and is NEVER removed. Front-matter
 * is ADDITIVE over that comment, not a replacement.
 *
 * Serialization is IDEMPOTENT: `parse(serialize(parse(content)))` equals
 * `parse(content)`, and `serialize(parse(serialize(fm)))` equals
 * `serialize(fm)`. On disagreement `status` comes from the front-matter while
 * the legacy comment is left untouched.
 */

import { dump, load } from "js-yaml"
import { PlanContractSchema } from "./schema"
import type { PlanFrontMatter } from "./types"

/** Leading `---` fenced YAML block; capture group 1 is the YAML body. */
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/**
 * Scalar labels that may be written as bare numbers (e.g. `phase: 1`) but are
 * modeled as strings in {@link PlanFrontMatter}; normalized on parse.
 */
const STRING_LABEL_KEYS = ["phase", "wave"] as const

function normalizeScalarLabels(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...raw }
  for (const key of STRING_LABEL_KEYS) {
    const value = normalized[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = String(value)
    }
  }
  return normalized
}

function extractFrontMatterBody(content: string): string | null {
  const match = FRONT_MATTER_RE.exec(content)
  return match?.[1] ?? null
}

/**
 * Parse the leading YAML front-matter block.
 *
 * Returns `null` when the block is absent, malformed, or fails the
 * {@link PlanFrontMatter} shape (e.g. missing `status`/`revision` or an
 * out-of-vocabulary status).
 */
export function parsePlanFrontMatter(content: string): PlanFrontMatter | null {
  const body = extractFrontMatterBody(content)
  if (body === null) return null

  let raw: unknown
  try {
    raw = load(body)
  } catch {
    return null
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null

  const candidate = normalizeScalarLabels(raw as Record<string, unknown>)
  const result = PlanContractSchema.shape.frontMatter.safeParse(candidate)
  if (!result.success) return null
  return result.data ?? null
}

/**
 * Serialize front-matter to a `---` fenced YAML block.
 *
 * Optional fields are omitted when `undefined`; array fields are emitted even
 * when empty. The returned block ends with a trailing newline so it can be
 * prepended to plan content additively.
 */
export function serializePlanFrontMatter(fm: PlanFrontMatter): string {
  const ordered: Record<string, unknown> = {
    status: fm.status,
    revision: fm.revision,
  }
  if (fm.phase !== undefined) ordered.phase = fm.phase
  if (fm.wave !== undefined) ordered.wave = fm.wave
  if (fm.deps !== undefined) ordered.deps = fm.deps
  if (fm.blockedBy !== undefined) ordered.blockedBy = fm.blockedBy

  const yaml = dump(ordered, { lineWidth: -1, noRefs: true })
  return `---\n${yaml}---\n`
}
