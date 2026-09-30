/// <reference types="bun-types" />
/**
 * Task 1 — BLOCKING PRECONDITION GATE for `plan-completion-review.md`.
 *
 * Plan B (`/plan-review`) scores a completed plan on 8 rubric dimensions; three
 * of them read plan H3 sections. This file proves that surface is real, as a
 * PASSING TEST rather than a claim. A failing precondition is a STOP.
 *
 * Nothing in `src/` is modified by this file. Nothing here re-implements
 * shipped logic: resolution comes from `resolveSectionSelector`, spans from
 * `buildSectionIndex`, progress from `countPlanProgressFromContent`, bytes from
 * `measurePlanBytes`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "../../../src/features/mission-state/constants"
import { countPlanProgressFromContent } from "../../../src/features/mission-state/storage"
import {
  normalizeSectionKey,
  resolveSectionSelector,
} from "../../../src/features/plan-contract/section-registry"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import {
  gateFailures,
  MIN_CORPUS_RESOLUTIONS,
  RUBRIC_H3_IDS,
  RUBRIC_H3_SELECTORS,
} from "./precondition-gate"
import { measurePlans } from "./precondition-corpus"
import { FIXTURE_PLAN_COUNT, fixtureCorpus } from "../../fixtures/completion-review/corpus-plans"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const VALIDATE_TS = join(REPO_ROOT, "src/features/plan-contract/validate.ts")
const TEST_ABORT = new AbortController()

// The corpus is COMMITTED FIXTURES, not `.matrixx/plans/`: that directory is
// gitignored, so measuring it made this gate green only on the machine that
// wrote it and red on every CI checkout.
const corpus = measurePlans(fixtureCorpus())

let fixtureDir = ""
const FIXTURE_PLAN = [
  "# Precondition Fixture",
  "",
  "## Work Objectives",
  "Body of the work objectives section.",
  "",
  "### Must NOT Have (Guardrails)",
  "- no `as any`",
  "",
  "### Concrete Deliverables",
  "- a delivered artefact",
  "",
  "### Test Decision",
  "TDD is required for this plan.",
  "",
  "## TODOs",
  "- [ ] 1. the only task",
  "",
].join("\n")

const ZERO_CHECKBOX_PLAN = [
  "# Vacuous Completeness Fixture",
  "",
  "## TL;DR",
  "A plan with sections but no numbered task lines at all.",
  "",
  "## Work Objectives",
  "Nothing is tracked as a checkbox here.",
  "",
].join("\n")

function testContext(directory: string) {
  return {
    sessionID: "test-session-completion-review-precondition",
    messageID: "test-message-completion-review-precondition",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory,
  } as unknown as Parameters<
    ReturnType<typeof createPlanReadTool>["execute"]
  >[1]
}

function writeFixturePlan(name: string, content: string): string {
  mkdirSync(join(fixtureDir, ".matrixx/plans"), { recursive: true })
  const filePath = join(fixtureDir, ".matrixx/plans", name)
  writeFileSync(filePath, content, "utf-8")
  return filePath
}

beforeAll(() => {
  fixtureDir = join(tmpdir(), `completion-review-precondition-${process.pid}-${Date.now()}`)
  writeFixturePlan("fixture-plan.md", FIXTURE_PLAN)
  writeFixturePlan("vacuous-plan.md", ZERO_CHECKBOX_PLAN)
})

afterAll(() => {
  if (fixtureDir && existsSync(fixtureDir)) rmSync(fixtureDir, { recursive: true, force: true })
})

describe("Plan A invariants that gate Plan B", () => {
  test("MAX_PLAN_FILE_BYTES is unchanged at 102400", () => {
    //#given Plan A converted the size cap from a wall into a ceiling
    //#when the sanctioned constant is read
    const cap = MAX_PLAN_FILE_BYTES
    //#then it is still the pre-cutover value
    expect(cap).toBe(102400)
  })

  test("validate.ts accumulates errors through exactly one errors.push site", () => {
    //#given the contract validator
    const source = readFileSync(VALIDATE_TS, "utf-8")
    //#when its error-accumulation sites are counted
    const sites = source.split("errors.push").length - 1
    //#then a single site remains, so no error path can bypass the reporter
    expect(sites).toBe(1)
  })
})

describe("Precondition 1 — plan_read accepts a section selector and returns that section's span", () => {
  test("the returned payload is exactly the section's span, line for line", async () => {
    //#given a plan whose sections are all single-spanned
    const tool = createPlanReadTool()
    const content = FIXTURE_PLAN
    const entry = buildSectionIndex(content).find((row) => row.id === "must-not-have-guardrails")
    expect(entry).toBeDefined()
    const expectedLineCount = entry!.endLine - entry!.startLine

    //#when the section is read with the `content` format
    const response = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/fixture-plan.md", section: "must-not-have-guardrails", format: "content" },
        testContext(fixtureDir),
      ),
    )

    //#then the returned line count EQUALS the span, not merely its text
    expect(response.error).toBeUndefined()
    expect(response.section.id).toBe("must-not-have-guardrails")
    expect(response.section.level).toBe(3)
    expect(response.startLine).toBe(entry!.startLine)
    expect(response.endLine).toBe(entry!.endLine)
    const returnedLines = String(response.content).split("\n")
    expect(returnedLines.length).toBe(expectedLineCount)
    expect(returnedLines[0]).toBe("### Must NOT Have (Guardrails)")
    const sourceLines = content.split("\n").slice(entry!.startLine - 1, entry!.endLine - 1)
    expect(returnedLines).toEqual(sourceLines)
    expect(measurePlanBytes(String(response.content))).toBeGreaterThan(0)
  })

  test("a section selector wins over offset/limit and reports precedence", async () => {
    //#given a conflicting section + pagination window
    const tool = createPlanReadTool()
    //#when both are supplied
    const response = JSON.parse(
      await tool.execute(
        {
          filePath: ".matrixx/plans/fixture-plan.md",
          section: "concrete-deliverables",
          format: "content",
          offset: 1,
          limit: 2,
        },
        testContext(fixtureDir),
      ),
    )
    //#then the conflict is reported, never silent
    expect(response.precedence).toBe("section")
    expect(String(response.content).split("\n")[0]).toBe("### Concrete Deliverables")
  })
})

describe("Preconditions 2-5 — the registry resolves the three rubric H3s across the corpus", () => {
  test("each rubric H3 resolves in the shipped registry to its H3 entry", () => {
    //#given the three H3s Plan B's rubric reads
    for (const selector of RUBRIC_H3_SELECTORS) {
      //#when each is resolved against PLAN_SECTION_REGISTRY
      const resolution = resolveSectionSelector(selector)
      //#then all three are registry hits, never the custom escape hatch
      expect(resolution.kind).toBe("resolved")
      if (resolution.kind !== "resolved") continue
      expect(resolution.entry.level).toBe(3)
      expect(resolution.entry.id).toBe(normalizeSectionKey(selector))
    }
  })

  test("the registry is an H2+H3 registry, not the pre-Plan-A H2-only list", () => {
    //#given the shipped registry
    const h2 = corpus.h2Total
    const h3 = corpus.h3Total
    //#when the heading depths in the real corpus are counted
    //#then H3 sections are addressable at all, and in bulk
    expect(h3).toBeGreaterThan(0)
    expect(corpus.h3Resolved).toBeGreaterThan(0)
    // `collectHeadings` was widened beyond H2-only: resolvable H3s exceed the
    // `custom` escape hatch, and H3s outnumber H2s in the corpus.
    expect(corpus.h3Resolved).toBeGreaterThan(corpus.h3Custom)
    expect(h3).toBeGreaterThan(h2)
  })

  test("each rubric H3 resolves to a NON-EMPTY body in at least MIN_CORPUS_RESOLUTIONS of the corpus", () => {
    // Measured by RESOLVED ID, not by heading text: the guardrails heading is
    // spelled three ways across the fixture corpus and the registry normalizer
    // is case-insensitive, so all spellings land on one id. A text-keyed gate
    // would under-count exactly the drift tolerance the registry provides.
    // Asserted against a floor rather than exact equality so a fixture can be
    // pruned without failing for a reason unrelated to the section surface.
    for (const id of RUBRIC_H3_IDS) {
      const bucket = corpus.bySelector[id]
      expect(bucket.resolvedPlans).toBe(bucket.resolvedNonEmpty)
      expect(bucket.resolvedNonEmpty).toBeGreaterThanOrEqual(MIN_CORPUS_RESOLUTIONS)
      expect(bucket.ambiguous).toBe(0)
    }
    expect(corpus.planCount).toBe(FIXTURE_PLAN_COUNT)
  })

  test("the committed corpus is large enough for the floor to be a real constraint", () => {
    //#given the floor and the committed corpus size
    //#then the corpus clears the floor with headroom, so lowering the floor
    //     could not be what makes this gate pass
    expect(FIXTURE_PLAN_COUNT).toBeGreaterThan(MIN_CORPUS_RESOLUTIONS)
    for (const id of RUBRIC_H3_IDS) {
      expect(corpus.bySelector[id].resolvedNonEmpty).toBe(FIXTURE_PLAN_COUNT)
    }
  })

  test("the gate FAILS when the registry stops resolving — the negative scenario", () => {
    //#given the same committed corpus measured against an EMPTY registry,
    //     which is how a missing/absent registry is simulated
    const withoutRegistry = measurePlans(fixtureCorpus(), [])
    //#when the same gate predicate runs
    const failures = gateFailures(withoutRegistry)
    //#then the gate refuses to pass, and names every rubric H3
    expect(failures.length).toBeGreaterThan(0)
    expect(failures).toEqual(
      expect.arrayContaining(RUBRIC_H3_IDS.map((id) => expect.stringContaining(id))),
    )
    for (const id of RUBRIC_H3_IDS) {
      expect(withoutRegistry.bySelector[id].resolvedNonEmpty).toBe(0)
    }
  })

  test("the registry resolves case-variant spellings to the same rubric id", () => {
    //#given the drift the normalizer exists to absorb
    const variants = ["Must NOT Have (Guardrails)", "Must NOT Have (guardrails)", "Must NOT have (guardrails)"]
    //#when each is resolved
    const ids = variants.map((variant) => {
      const resolution = resolveSectionSelector(variant)
      expect(resolution.kind).toBe("resolved")
      return resolution.kind === "resolved" ? resolution.entry.id : ""
    })
    //#then all three land on the one registry id, so no plan is excluded by spelling
    expect(new Set(ids)).toEqual(new Set(["must-not-have-guardrails"]))
  })

  test("the registry reports zero ambiguous resolutions across the whole corpus", () => {
    const total = Object.values(corpus.bySelector).reduce((sum, bucket) => sum + bucket.ambiguous, 0)
    expect(total).toBe(0)
  })

  test("the corpus gate itself reports no failures", () => {
    expect(gateFailures(corpus)).toEqual([])
  })
})

describe("Precondition 6 — zero-checkbox plans stay needsTriage (vacuous-completeness trap)", () => {
  test("a plan with no checkbox reports isComplete true AND needsTriage true", async () => {
    //#given a plan with sections but zero task checkboxes
    const progress = countPlanProgressFromContent(ZERO_CHECKBOX_PLAN)
    //#when the same plan is routed through the section-addressable surface
    const tool = createPlanReadTool()
    const response = JSON.parse(
      await tool.execute(
        { filePath: ".matrixx/plans/vacuous-plan.md", section: "work-objectives", format: "content" },
        testContext(fixtureDir),
      ),
    )
    //#then the read succeeds and the vacuity signal is NOT lost
    expect(response.error).toBeUndefined()
    expect(response.section.id).toBe("work-objectives")
    expect(progress.total).toBe(0)
    expect(progress.completed).toBe(0)
    expect(progress.isComplete).toBe(true)
    expect(progress.needsTriage).toBe(true)
  })

  test("a plan with an unchecked task is neither complete nor needs-triage", () => {
    const progress = countPlanProgressFromContent(FIXTURE_PLAN)
    expect(progress.total).toBe(1)
    expect(progress.isComplete).toBe(false)
    expect(progress.needsTriage).toBe(false)
  })
})
