/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { CANONICAL_SECTIONS } from "../../../src/features/plan-contract/constants"
import {
  buildSectionRegistry,
  CONSENSUS_H3_SEEDS,
  extractHeadingLevel,
  extractHeadingText,
  H3_SECTION_REGISTRY,
  normalizeSectionKey,
  resolveSectionSelector,
  SECTION_REGISTRY,
  type SectionRegistryEntry,
  type SectionResolution,
} from "../../../src/features/plan-contract/section-registry"

describe("section-registry", () => {
  test("registry entry count is derived from CANONICAL_SECTIONS", () => {
    //#given the canonical H2 list from constants.ts
    //#when reading the derived registry
    //#then the count matches dynamically (never hardcoded)
    expect(SECTION_REGISTRY).toHaveLength(CANONICAL_SECTIONS.length)
    expect(SECTION_REGISTRY.map((e) => e.heading)).toEqual([...CANONICAL_SECTIONS])
  })

  test("every registry entry is an H2 with a stable kebab-case id", () => {
    //#given the derived registry
    //#when inspecting level and id shape
    //#then levels are 2 and ids match /^[a-z0-9]+(-[a-z0-9]+)*$/
    const ids = SECTION_REGISTRY.map((e) => e.id)
    for (const entry of SECTION_REGISTRY) {
      expect(entry.level).toBe(2)
      expect(entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("MANDATORY-suffix and suffix-less headings resolve to the same id", () => {
    //#given two corpus spellings of the same canonical section
    //#when resolving each as a selector
    //#then both yield verification-strategy
    const withSuffix = resolveSectionSelector("Verification Strategy (MANDATORY)")
    const withoutSuffix = resolveSectionSelector("Verification Strategy")
    expect(withSuffix.kind).toBe("resolved")
    expect(withoutSuffix.kind).toBe("resolved")
    if (withSuffix.kind === "resolved" && withoutSuffix.kind === "resolved") {
      expect(withSuffix.entry.id).toBe("verification-strategy")
      expect(withoutSuffix.entry.id).toBe(withSuffix.entry.id)
    }
  })

  test("all three Agent-Executed QA Scenarios spellings normalize to one key", () => {
    //#given the three observed corpus spellings
    //#when normalizing each
    //#then all three collapse to the same key
    const spellings = [
      "Agent-Executed QA Scenarios",
      "Agent Executed QA Scenarios",
      "Agent-Executed Q/A Scenarios",
    ]
    const keys = spellings.map(normalizeSectionKey)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe("agent-executed-qa-scenarios")
  })

  test("ambiguous selector fails closed listing every candidate", () => {
    //#given a registry with two entries that normalize identically
    const ambiguous = buildSectionRegistry([
      { heading: "Verification Strategy", level: 2 },
      { heading: "Verification-Strategy", level: 3 },
    ])
    //#when resolving the shared selector
    const result = resolveSectionSelector("Verification Strategy", ambiguous)
    //#then it is an ambiguity error naming BOTH ids, not a first-match
    expect(result.kind).toBe("ambiguous")
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual([
        "verification-strategy",
        "verification-strategy",
      ])
      expect(result.message).toContain("verification-strategy")
      expect(result.candidates).toHaveLength(2)
    }
  })

  test("zero-match selector is NOT an error (falls through to the escape hatch)", () => {
    //#given a heading that is not in the registry
    //#when resolving it
    const result = resolveSectionSelector("Deployment Strategy")
    //#then it falls through as a custom section, never as an error
    expect(result.kind).toBe("custom")
    expect("message" in result).toBe(false)
    if (result.kind === "custom") {
      //#then it carries a derived id and the raw text
      expect(result.id).toBe("deployment-strategy")
      expect(result.rawText).toBe("Deployment Strategy")
    }
  })

  test("extractHeadingText returns text after an H2/H3 marker only", () => {
    //#given heading lines at several levels
    //#when extracting
    //#then only #{2,3} produce text
    expect(extractHeadingText("## Work Objectives")).toBe("Work Objectives")
    expect(extractHeadingText("### Agent-Executed QA Scenarios")).toBe("Agent-Executed QA Scenarios")
    expect(extractHeadingText("# Title")).toBeNull()
    expect(extractHeadingText("#### Deep")).toBeNull()
    expect(extractHeadingText("not a heading")).toBeNull()
  })

  test("selector may be a raw heading line", () => {
    //#given a full markdown heading line
    //#when resolving it
    //#then the marker is stripped before normalization
    const result = resolveSectionSelector("## Success Criteria")
    expect(result.kind).toBe("resolved")
    if (result.kind === "resolved") {
      expect(result.entry.id).toBe("success-criteria")
    }
  })

  test("every canonical heading resolves back to its own id", () => {
    //#given all canonical headings
    const resolved = CANONICAL_SECTIONS.map((heading) => resolveSectionSelector(heading))
    //#when each is resolved
    //#then none is ambiguous or unmatched
    for (const result of resolved) {
      expect(result.kind).toBe("resolved")
    }
    //#then the derived ids are the documented stable set
    const ids = resolved.map((r) => (r.kind === "resolved" ? r.entry.id : ""))
    expect(ids).toEqual([
      "tl-dr",
      "context",
      "work-objectives",
      "verification-strategy",
      "execution-strategy",
      "todos",
      "commit-strategy",
      "success-criteria",
    ])
  })

  test("normalizeSectionKey is idempotent", () => {
    //#given a messy heading
    //#when normalized twice
    //#then the second pass is a no-op
    const once = normalizeSectionKey("  — Verification_Strategy —  ")
    expect(once).toBe(normalizeSectionKey(once))
    expect(once).toBe("verification-strategy")
  })

  test("the H3 consensus registry holds the 14 empirical headings with derived ids", () => {
    //#given the consensus H3 seeds
    //#when the H3 registry is derived
    //#then it has exactly 14 entries, all level 3, with unique derived ids
    expect(H3_SECTION_REGISTRY).toHaveLength(14)
    const ids = H3_SECTION_REGISTRY.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.sort()).toEqual(
      [
        "agent-dispatch-summary",
        "concrete-deliverables",
        "core-objective",
        "definition-of-done",
        "dependency-matrix",
        "final-checklist",
        "interview-summary",
        "must-have",
        "must-not-have-guardrails",
        "original-request",
        "parallel-execution-waves",
        "seraph-review",
        "test-decision",
        "verification-commands",
      ].sort(),
    )
  })

  test("every consensus H3 id equals what normalizeSectionKey derives (no hand-written ids)", () => {
    //#given each H3 registry entry
    //#when re-deriving the id from its own heading text
    //#then id, key and the normalizer all agree
    for (const entry of H3_SECTION_REGISTRY) {
      expect(entry.id).toBe(normalizeSectionKey(entry.heading))
      expect(entry.key).toBe(entry.id)
      expect(entry.level).toBe(3)
    }
  })

  test("every consensus H3 heading resolves back to its own registry id", () => {
    //#given the 14 consensus H3 source spellings
    const headings = CONSENSUS_H3_SEEDS.map((s) => s.heading)
    //#when each is resolved
    const results = headings.map((h) => resolveSectionSelector(h))
    //#then every one is resolved (none ambiguous, none custom)
    for (const result of results) {
      expect(result.kind).toBe("resolved")
    }
  })

  test("the load-bearing H3 entries are explicit, not fuzzy matches", () => {
    //#given the load-bearing guardrail / DoD / deliverable / test headings
    const loadBearing = [
      "Must NOT Have (Guardrails)",
      "Definition of Done",
      "Concrete Deliverables",
      "Test Decision",
    ]
    //#when each is resolved
    const results = loadBearing.map((h) => resolveSectionSelector(h))
    //#then each resolves to its exact registry entry
    expect(results.map((r) => (r.kind === "resolved" ? r.entry.heading : ""))).toEqual(loadBearing)
  })

  test("an unregistered H3 falls through to custom and is never an error", () => {
    //#given a nonsense H3 heading line
    //#when resolving it
    const result = resolveSectionSelector("### Zebra Custom Subsection")
    //#then it is a first-class custom section with an id, rawText and level
    expect(result.kind).toBe("custom")
    if (result.kind === "custom") {
      expect(result.id).toBe("zebra-custom-subsection")
      expect(result.rawText).toBe("Zebra Custom Subsection")
      expect(result.level).toBe(3)
      expect("message" in result).toBe(false)
    }
  })

  test("the skeleton's own extra H3s are custom, not registry entries", () => {
    //#given the two H3s the skeleton emits that the registry deliberately omits
    const extras = ["### If TDD Enabled", "### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)"]
    //#when resolving each
    const results = extras.map((h) => resolveSectionSelector(h))
    //#then both are custom (no alias was added for them)
    expect(results.map((r) => r.kind)).toEqual(["custom", "custom"])
  })

  test("the three corpus QA-scenario spellings all resolve to the same custom id", () => {
    //#given the three observed corpus spellings as heading lines
    const spellings = [
      "### Agent-Executed QA Scenarios",
      "### Agent Executed QA Scenarios",
      "### Agent-Executed Q/A Scenarios",
    ]
    //#when resolving each
    const results = spellings.map((h) => resolveSectionSelector(h))
    //#then none is ambiguous and all three carry one identical derived id
    for (const result of results) {
      expect(result.kind).not.toBe("ambiguous")
      expect(result.kind).toBe("custom")
    }
    const ids = results.map((r) => (r.kind === "custom" ? r.id : ""))
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe("agent-executed-qa-scenarios")
  })

  test("adding the H3 consensus does not make any H2 selector ambiguous", () => {
    //#given every canonical H2 heading
    //#when resolved against the FULL H2+H3 registry
    //#then each still resolves to exactly one H2 entry
    for (const heading of CANONICAL_SECTIONS) {
      const result = resolveSectionSelector(heading)
      expect(result.kind).toBe("resolved")
      if (result.kind === "resolved") {
        expect(result.entry.level).toBe(2)
      }
    }
  })

  test("the kind discriminant narrows and an unknown kind is a type error", () => {
    //#given a resolution value
    const result: SectionResolution = resolveSectionSelector("### Zebra Custom Subsection")
    //#when switching on the discriminant
    let seen: string
    switch (result.kind) {
      case "resolved":
        seen = result.entry.id
        break
      case "custom":
        seen = result.id
        break
      case "ambiguous":
        seen = result.message
        break
      default: {
        //#then the union is exhaustive: nothing remains to handle
        const exhaustive: never = result
        seen = String(exhaustive)
      }
    }
    expect(seen).toBe("zebra-custom-subsection")
  })

  test("custom sections are first-class: the id is stable and re-resolvable", () => {
    //#given a custom heading resolved twice
    const first = resolveSectionSelector("### Zebra Custom Subsection")
    const second = resolveSectionSelector("zebra-custom-subsection")
    //#then both yield the same custom id — addressing round-trips
    expect(first.kind).toBe("custom")
    expect(second.kind).toBe("custom")
    if (first.kind === "custom" && second.kind === "custom") {
      expect(second.id).toBe(first.id)
    }
  })

  test("extractHeadingLevel reports 2 or 3 for a heading line and null otherwise", () => {
    //#given heading lines at several levels
    //#when the level is extracted
    //#then only #{2,3} produce a level
    expect(extractHeadingLevel("## Work Objectives")).toBe(2)
    expect(extractHeadingLevel("### Final Checklist")).toBe(3)
    expect(extractHeadingLevel("# Title")).toBeNull()
    expect(extractHeadingLevel("#### Deep")).toBeNull()
    expect(extractHeadingLevel("Final Checklist")).toBeNull()
  })

  test("every consensus H3 + 5 corpus variants resolves without an error", () => {
    //#given the consensus H3s plus known real-world drift spellings
    const corpus = [
      ...CONSENSUS_H3_SEEDS.map((s) => `### ${s.heading}`),
      "### original request",
      "### MUST NOT Have (Guardrails)",
      "### Definition of Done ",
      "### Parallel Execution Waves",
      "### Agent Dispatch Summary",
    ]
    //#when resolving every one
    const results = corpus.map((h) => resolveSectionSelector(h))
    //#then none is ambiguous, and every one is either resolved or custom — never an error
    for (const result of results) {
      expect(result.kind).not.toBe("ambiguous")
      expect(["resolved", "custom"]).toContain(result.kind)
      expect("message" in result).toBe(false)
    }
  })

  test("SectionRegistryEntry shape is importable for downstream consumers", () => {
    //#given the exported entry type
    const entry: SectionRegistryEntry = { id: "x", level: 2, heading: "X", key: "x" }
    //#then it carries id, level, heading and normalized key
    expect(entry.level).toBe(2)
  })
})
