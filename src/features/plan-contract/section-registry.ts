/**
 * Plan Contract — Section Registry (Task 3) + H3 consensus and the `custom`
 * escape hatch (Task 4).
 *
 * WHY HERE: every runtime consumer lives in `src/tools/plan/` (section-index,
 * plan_read, plan_update) or is a test. Nothing in the validator consumes this
 * module — a registry miss must never become a contract error.
 *
 * MATCHING RULE: take the text after the `#{2,3}` marker ({@link
 * extractHeadingText}; a bare selector is used verbatim), run {@link
 * normalizeSectionKey} (strips `(MANDATORY)`, lowercases, deletes joining `/`
 * and parens, collapses `-`/`_`/`:`/`;`/dashes/whitespace to one `-`), then
 * compare against the identically-normalized registry `key`.
 * `normalizeSectionTitle` is IMPORTED from validate.ts, never re-implemented,
 * so `MANDATORY_SUFFIX_RE` keeps exactly one definition site in `src/`.
 *
 * This survives the three corpus spellings of `### Agent-Executed QA Scenarios`
 * (hyphen / space / `Q/A` — 15 occurrences across 35 plans), and makes
 * `## Verification Strategy` and `## Verification Strategy (MANDATORY)` the
 * same key (7/35 plans omit the suffix).
 * FAIL-CLOSED: a selector normalizing to MORE THAN ONE registry entry is an
 * error listing every candidate — never a silent first-match. A ZERO-MATCH is
 * NOT an error: it is the `custom` escape hatch. Zero-match and multi-match
 * have different remedies (any heading vs. a disambiguated one).
 *
 * H2 level is DERIVED from `CANONICAL_SECTIONS`; H3 from `CONSENSUS_H3_SEEDS`.
 * The registry is deliberately incomplete (95 distinct H2 texts and 238
 * distinct H3s in the corpus), so a miss yields `kind:"custom"` — never an
 * error, never capped, never a `message`. CONSUMERS MUST NOT re-stringify a
 * parsed markdown AST back to a heading: `mdast-util-to-markdown` is lossy by
 * design and will not reproduce the source spelling, so a derived id would
 * silently stop matching. Address headings by their ORIGINAL line text.
 */
import { CANONICAL_SECTIONS } from "./constants"
import { CONSENSUS_H3_SEEDS } from "./section-registry-h3"
import { normalizeSectionTitle } from "./validate"

export { CONSENSUS_H3_SEEDS } from "./section-registry-h3"

/**
 * Return the depth of an H2/H3 heading line, or `null` when `line` is not a
 * `#{2,3}` heading. Used only to label an escape-hatch `custom` section; a
 * selector with no marker is unknown-depth, not H2.
 */
export function extractHeadingLevel(line: string): SectionLevel | null {
  const match = /^(#{2,3})\s+\S/.exec(line)
  return match ? (match[1].length as SectionLevel) : null
}

/** Heading depth of a registry entry. */
export type SectionLevel = 2 | 3

/** One registry row: stable id, depth, canonical heading text, normalized key. */
export interface SectionRegistryEntry {
  /** Stable kebab-case identifier, e.g. `verification-strategy`. */
  id: string
  /** Markdown heading depth. */
  level: SectionLevel
  /** Canonical heading text, exactly as it appears in the plan. */
  heading: string
  /** Normalized comparison key — the output of {@link normalizeSectionKey}. */
  key: string
}

/** Raw input accepted by {@link buildSectionRegistry}. */
export interface SectionRegistrySeed {
  heading: string
  level: SectionLevel
}

/**
 * `custom` is the ESCAPE HATCH, not a failure: a heading absent from the
 * registry is a legitimate plan extension (the 35-plan corpus has 95 distinct
 * H2 texts and 238 distinct H3s). It carries a derived `id` and the `rawText`
 * it was addressed by, so a custom section is as addressable as a registry
 * one. It deliberately has NO `message` key, so it can never be mistaken for
 * the `ambiguous` failure, and the number of custom sections is never capped.
 */
export type SectionResolution =
  | { kind: "resolved"; entry: SectionRegistryEntry }
  | { kind: "custom"; selector: string; rawText: string; id: string; key: string; level: SectionLevel | null }
  | { kind: "ambiguous"; selector: string; key: string; candidates: SectionRegistryEntry[]; message: string }

/**
 * Internal `-`, `_`, `:`, `;`, em dash, en dash and whitespace → one `-`.
 * NOTE `/` is intentionally NOT here: it is a JOINING slash (`Q/A` ≡ `QA`),
 * handled by {@link JOINING_SLASH_RE} below. The spec lists `/` among the
 * separators, but acceptance requires `### Agent-Executed Q/A Scenarios` to
 * equal `### Agent-Executed QA Scenarios`, which only holds when `/` joins its
 * neighbours instead of separating them.
 */
const SEPARATOR_RE = /[-_:;—–\s]+/g
/** Joining slash — deleted, so `Q/A` collapses to `qa`. */
const JOINING_SLASH_RE = /\//g
/**
 * Parens — deleted. `(MANDATORY)` is already removed by `normalizeSectionTitle`
 * before this runs; this strips the rest so `### Must NOT Have (Guardrails)`
 * yields the kebab id `must-not-have-guardrails`, not
 * `must-not-have-(guardrails)`, which would break the kebab-id invariant.
 */
const PAREN_RE = /[()]/g

/**
 * Normalize arbitrary heading text or a registry key to its canonical
 * kebab-case comparison form (identical to a registry entry's `id`).
 * Pure and idempotent. Exported for tests and for callers that pre-index
 * headings.
 */
export function normalizeSectionKey(text: string): string {
  return normalizeSectionTitle(text)
    .toLowerCase()
    .replace(JOINING_SLASH_RE, "")
    .replace(PAREN_RE, "")
    .replace(SEPARATOR_RE, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Return the text after an H2/H3 marker, or `null` when `line` is not a `#{2,3}`
 * heading. Mirrors the `H2_RE` style at `validate.ts:22` — it does NOT replace
 * `DOD_HEADING_RE` (H2–H4), which stays authoritative.
 */
export function extractHeadingText(line: string): string | null {
  const match = /^#{2,3}\s+(.+?)\s*$/.exec(line)
  return match?.[1] ?? null
}

/** Build a registry from explicit seeds, deriving ids and keys from headings. */
export function buildSectionRegistry(seeds: readonly SectionRegistrySeed[]): SectionRegistryEntry[] {
  return seeds.map((seed) => {
    const key = normalizeSectionKey(seed.heading)
    return { id: key, level: seed.level, heading: seed.heading, key }
  })
}

/** The derived H2 registry — one entry per `CANONICAL_SECTIONS` item, in order. */
export const SECTION_REGISTRY: readonly SectionRegistryEntry[] = buildSectionRegistry(
  CANONICAL_SECTIONS.map((heading) => ({ heading, level: 2 as const })),
)

/** The derived H3 consensus registry — ids come from the same normalizer. */
export const H3_SECTION_REGISTRY: readonly SectionRegistryEntry[] = buildSectionRegistry(CONSENSUS_H3_SEEDS)

/**
 * Compile-time exhaustiveness gate. `tsc` checks `src/` but EXCLUDES `tests/`
 * (see `tsconfig.json`), so this is where the union's closure is actually
 * enforced: adding a variant to {@link SectionResolution} without adding it to
 * this table is a build error.
 */
export type SectionResolutionKind = SectionResolution["kind"]

const _KIND_TABLE_GATE: Record<SectionResolutionKind, true> = {
  resolved: true,
  custom: true,
  ambiguous: true,
}
void _KIND_TABLE_GATE

/** The full H2 + H3 registry — every heading the resolver recognises. */
export const PLAN_SECTION_REGISTRY: readonly SectionRegistryEntry[] = [
  ...SECTION_REGISTRY,
  ...H3_SECTION_REGISTRY,
]

/**
 * Resolve a selector (raw heading text, an `## `/`### ` line, or a kebab id)
 * against `entries` (defaults to the full H2+H3 {@link PLAN_SECTION_REGISTRY}).
 *
 * Returns `ambiguous` with EVERY candidate when more than one entry matches,
 * `custom` when none does (the escape hatch, never an error), and `resolved`
 * otherwise.
 */
export function resolveSectionSelector(
  selector: string,
  entries: readonly SectionRegistryEntry[] = PLAN_SECTION_REGISTRY,
): SectionResolution {
  const heading = extractHeadingText(selector) ?? selector
  const key = normalizeSectionKey(heading)
  const candidates = entries.filter((entry) => entry.key === key)
  if (candidates.length > 1) {
    const listed = candidates.map((c) => `"${c.id}" (## ${c.heading})`).join(", ")
    return {
      kind: "ambiguous",
      selector,
      key,
      candidates: [...candidates],
      message: `Section selector "${selector}" is ambiguous — it matches ${candidates.length} registry entries: ${listed}`,
    }
  }
  const [match] = candidates
  if (match) return { kind: "resolved", entry: match }
  return {
    kind: "custom",
    selector,
    rawText: heading,
    id: key,
    key,
    level: extractHeadingLevel(selector),
  }
}
