/// <reference types="bun-types" />
/**
 * Task 5 — the 8-dimension rubric, its enforced `kind` tags, and the APB grade.
 *
 * RED was behavioural: every assertion below failed on a WRONG SHAPE or a
 * MISSING CONSTRAINT, never on a missing module, because the module under test
 * was created empty of dimensions first and the assertions describe the contract.
 */
import { describe, expect, test } from "bun:test"
import { RUBRIC_DIMENSIONS } from "../../../src/features/completion-review/rubric"
import {
  apbGrade,
  scoreRubric,
  totalWeight,
  type DeterministicInputs,
  type RubricDimension,
} from "../../../src/features/completion-review/rubric"
import { checkRubricStructure } from "../../../src/features/completion-review/rubric-gate"
import { computeDoDCoverage } from "../../../src/features/completion-review/rubric-dod"
import { computeDeliverableDrift } from "../../../src/features/completion-review/rubric-drift"
import { computeTestDecisionHonored } from "../../../src/features/completion-review/rubric-test-decision"
import { EVIDENCE_PROVENANCE } from "../../../src/features/completion-review/evidence-types"
import type { DoDEvidence } from "../../../src/features/completion-review/evidence-types"
import type { AttributionFacts, DriftFacts, ProgressFacts } from "./rubric-fixtures"

const PASSING: DoDEvidence = {
  itemId: "dod-1",
  outcome: "pass",
  provenance: EVIDENCE_PROVENANCE.NOTEPAD,
  taskId: "T-abc",
  evidenceFiles: [],
}

const UNVERIFIABLE: DoDEvidence = {
  itemId: "dod-2",
  outcome: "unverifiable",
  provenance: EVIDENCE_PROVENANCE.NONE,
  taskId: null,
  evidenceFiles: [],
}

function inputs(overrides: Partial<DeterministicInputs> = {}): DeterministicInputs {
  return {
    dod: ["dod-1", "dod-2"],
    evidence: [PASSING, UNVERIFIABLE],
    progress: progress(1, 4),
    attribution: attribution({ matches: true }),
    drift: drift(),
    degradation: { unscorableDimensions: [], reasons: {} },
    declaredDeliverables: ["src/a.ts"],
    testDecision: { plannedTdd: true, declaredTaskCount: 2 },
    tests: { testFiles: 2, tddMarkedTests: 2 },
    ...overrides,
  }
}

function progress(completed: number, total: number): ProgressFacts {
  return { total, completed, remaining: total - completed, isComplete: completed === total }
}

function attribution(overrides: Partial<AttributionFacts> = {}): AttributionFacts {
  return { linkedTotal: 4, linkedTerminal: 4, planTasks: 4, ratio: 1, matches: true, ...overrides }
}

function drift(overrides: Partial<DriftFacts> = {}): DriftFacts {
  return { startCommit: "abc123", stat: "1 file changed", nameStatus: [{ status: "M", path: "src/a.ts" }], unscorable: false, unscorableReason: null, ...overrides }
}

function byId(id: string): RubricDimension {
  const found = RUBRIC_DIMENSIONS.find((d) => d.id === id)
  if (!found) throw new Error(`no dimension ${id}`)
  return found
}

describe("rubric structure", () => {
  test("declares exactly 8 dimensions", () => {
    //#given the exported rubric
    //#when it is counted
    const count = RUBRIC_DIMENSIONS.length
    //#then there are eight
    expect(count).toBe(8)
  })

  test("dimensions 1 5 and 7 are DETERMINISTIC and the rest are MODEL", () => {
    //#given the exported rubric
    //#when each dimension's kind is read
    const kinds = RUBRIC_DIMENSIONS.map((d) => d.kind)
    //#then the split is the reviewed one
    expect(kinds).toEqual([
      "DETERMINISTIC",
      "MODEL",
      "MODEL",
      "MODEL",
      "DETERMINISTIC",
      "MODEL",
      "DETERMINISTIC",
      "MODEL",
    ])
  })

  test("a DETERMINISTIC dimension carries compute and a MODEL dimension does not", () => {
    //#given the exported rubric
    //#when compute presence is checked per kind
    const deterministicHaveCompute = RUBRIC_DIMENSIONS.filter((d) => d.kind === "DETERMINISTIC").map((d) => typeof d.compute)
    const modelHaveCompute = RUBRIC_DIMENSIONS.filter((d) => d.kind === "MODEL").map((d) => "compute" in d)
    //#then only the deterministic ones are implemented
    expect(deterministicHaveCompute).toEqual(["function", "function", "function"])
    expect(modelHaveCompute).toEqual([false, false, false, false, false])
  })

  test("weights sum to exactly 1.0", () => {
    //#given the exported weights
    //#when they are summed
    const sum = totalWeight()
    //#then the weighted mean is a mean
    expect(sum).toBeCloseTo(1, 10)
  })

  test("the structure gate rejects a DETERMINISTIC dimension with no compute", () => {
    //#given a rubric whose first dimension is tagged deterministic but bare
    const broken = [{ ...byId("dod-coverage"), compute: undefined }] as unknown as RubricDimension[]
    //#when the gate runs
    const failures = checkRubricStructure(broken)
    //#then the missing implementation is a failure, not a silent pass
    expect(failures.some((f) => f.includes("compute"))).toBe(true)
  })

  test("the structure gate rejects a MODEL dimension that smuggles in compute", () => {
    //#given a rubric whose guardrail dimension carries a compute function
    const broken = [byId("guardrail-adherence"), { ...byId("goal-attainment"), compute: () => 1 }] as unknown as RubricDimension[]
    //#when the gate runs
    const failures = checkRubricStructure(broken)
    //#then a model-informed observed side is caught
    expect(failures.some((f) => f.includes("MODEL"))).toBe(true)
  })

  test("the structure gate accepts the shipped rubric", () => {
    //#given the exported rubric
    //#when the gate runs
    const failures = checkRubricStructure(RUBRIC_DIMENSIONS)
    //#then nothing is reported
    expect(failures).toEqual([])
  })
})

describe("dimension 1 — all-pass vs avg-pass", () => {
  test("4 DoD lines with 1 completed task yields allPass false and avgPass 0.25", () => {
    //#given 4 DoD lines where exactly one has a machine-written completion
    const four = ["dod-1", "dod-2", "dod-3", "dod-4"]
    const evidence: DoDEvidence[] = [PASSING, ...["dod-2", "dod-3", "dod-4"].map((itemId) => ({ ...UNVERIFIABLE, itemId }))]
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs({ dod: four, evidence }))
    //#then the mean is a quarter and the all-pass claim is false
    expect(result.status).toBe("scored")
    if (result.status !== "scored") return
    expect(result.allPass).toBe(false)
    expect(result.avgPass).toBe(0.25)
  })

  test("the gap between all-pass and avg-pass is reported as its own signal", () => {
    //#given the same 1-of-4 scenario
    const four = ["dod-1", "dod-2", "dod-3", "dod-4"]
    const evidence: DoDEvidence[] = [PASSING, ...["dod-2", "dod-3", "dod-4"].map((itemId) => ({ ...UNVERIFIABLE, itemId }))]
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs({ dod: four, evidence }))
    //#then the 0.75 gap is surfaced rather than left for a caller to derive
    if (result.status !== "scored") throw new Error("expected scored")
    expect(result.gap).toBe(0.75)
    expect(result.gap).toBeCloseTo(1 - result.avgPass, 10)
  })

  test("a fully covered plan is all-pass with no gap", () => {
    //#given one DoD line with a machine-written completion
    const evidence: DoDEvidence[] = [PASSING]
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs({ dod: ["dod-1"], evidence }))
    //#then all-pass holds and the gap is zero
    if (result.status !== "scored") throw new Error("expected scored")
    expect(result.allPass).toBe(true)
    expect(result.avgPass).toBe(1)
    expect(result.gap).toBe(0)
  })
})

describe("degradation is data, never a fabricated zero", () => {
  test("a fully unverifiable DoD set degrades to unscorable with a reason", () => {
    //#given a DoD set where no item has machine-written evidence
    const evidence: DoDEvidence[] = ["dod-1", "dod-2"].map((itemId) => ({ ...UNVERIFIABLE, itemId }))
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs({ dod: ["dod-1", "dod-2"], evidence }))
    //#then it is unscorable, not a score of 0
    expect(result.status).toBe("unscorable")
    if (result.status !== "unscorable") return
    expect(result.reason.length).toBeGreaterThan(0)
  })

  test("an unverifiable item is counted and named, never folded into pass or fail", () => {
    //#given 1 passing and 1 unverifiable DoD item
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs())
    //#then the unverifiable item is visible in its own counter
    if (result.status !== "scored") throw new Error("expected scored")
    expect(result.passed).toBe(1)
    expect(result.failed).toBe(0)
    expect(result.unverifiable).toBe(1)
  })

  test("a plan with no DoD lines at all is unscorable rather than vacuously perfect", () => {
    //#given a plan declaring zero DoD lines
    //#when dimension 1 is computed
    const result = computeDoDCoverage(inputs({ dod: [], evidence: [] }))
    //#then it does not claim 100% coverage
    expect(result.status).toBe("unscorable")
  })

  test("dimension 5 degrades when the plan records no start commit", () => {
    //#given drift facts flagged unscorable by the gatherer
    const facts = drift({ unscorable: true, unscorableReason: "plan records no start commit" })
    //#when dimension 5 is computed
    const result = computeDeliverableDrift(inputs({ drift: facts }))
    //#then it reports the gatherer's reason
    expect(result.status).toBe("unscorable")
  })

  test("dimension 7 degrades when the Test Decision section is absent", () => {
    //#given no Test Decision section
    //#when dimension 7 is computed
    const result = computeTestDecisionHonored(inputs({ testDecision: null }))
    //#then it is unscorable
    expect(result.status).toBe("unscorable")
  })
})

describe("scoring and the APB grade", () => {
  test("the score is the weighted mean of the scored dimensions", () => {
    //#given a two-dimension probe rubric
    const probe: RubricDimension[] = [
      { ...byId("dod-coverage"), weight: 0.75, compute: () => ({ status: "scored", score: 1, allPass: true, avgPass: 1, gap: 0, dodTotal: 1, passed: 1, failed: 0, unverifiable: 0 }) },
      { ...byId("deliverable-drift"), weight: 0.25, compute: () => ({ status: "scored", score: 0, signals: {} }) },
    ]
    //#when the rubric is scored
    const result = scoreRubric(probe, {})
    //#then the mean is the weighted one
    expect(result.score).toBeCloseTo(0.75, 10)
  })

  test("an unscorable dimension is excluded and the scored weight is reported", () => {
    //#given a probe where one dimension cannot be computed
    const probe: RubricDimension[] = [
      { ...byId("dod-coverage"), weight: 0.5, compute: () => ({ status: "scored", score: 0.8, allPass: false, avgPass: 0.8, gap: 0.2, dodTotal: 5, passed: 4, failed: 0, unverifiable: 1 }) },
      { ...byId("deliverable-drift"), weight: 0.5, compute: () => ({ status: "unscorable", reason: "no start commit" }) },
    ]
    //#when the rubric is scored
    const result = scoreRubric(probe, {})
    //#then only the measurable half counts and the shortfall is visible
    expect(result.score).toBeCloseTo(0.8, 10)
    expect(result.scoredWeight).toBeCloseTo(0.5, 10)
    expect(result.unscorable).toEqual(["deliverable-drift"])
  })

  test("the APB grade snaps the continuous score to the discrete ladder", () => {
    //#given continuous scores across the ladder
    const expected: Array<[number, number]> = [
      [0, 0],
      [0.11, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
      [0.79, 0.8],
      [0.85, 1],
      [1, 1],
    ]
    //#when each is graded
    const grades = expected.map(([score]) => apbGrade(score))
    //#then every grade is on {0, .2, .4, .6, .8, 1}
    expect(grades).toEqual(expected.map(([, grade]) => grade))
  })

  test("a continuous score is emitted alongside the discrete grade", () => {
    //#given a probe scoring 0.5
    const probe: RubricDimension[] = [
      { ...byId("dod-coverage"), weight: 1, compute: () => ({ status: "scored", score: 0.5, allPass: false, avgPass: 0.5, gap: 0.5, dodTotal: 2, passed: 1, failed: 0, unverifiable: 0 }) },
    ]
    //#when the rubric is scored
    const result = scoreRubric(probe, {})
    //#then both the continuous score and the coarse grade are present
    expect(result.score).toBeCloseTo(0.5, 10)
    expect(result.grade).toBe(0.6)
  })
})

describe("purity", () => {
  test("the rubric never references autoScoreComplexity", async () => {
    //#given the rubric source files
    const { readdirSync, readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const dir = join(import.meta.dir, "..", "..", "..", "src", "features", "completion-review")
    const sources = readdirSync(dir)
      .filter((f) => f.startsWith("rubric"))
      .map((f) => readFileSync(join(dir, f), "utf-8"))
      .join("\n")
    //#then the routing-only complexity scorer is absent
    expect(sources).not.toContain("autoScoreComplexity")
    expect(sources).not.toContain("complexity-scorer")
  })

  test("a deterministic compute returns the same value twice over the same input", () => {
    //#given one fixed input
    const fixed = inputs()
    //#when dimension 5 runs twice
    const first = computeDeliverableDrift(fixed)
    const second = computeDeliverableDrift(fixed)
    //#then the function is pure
    expect(first).toEqual(second)
  })
})
