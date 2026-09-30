/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { renderReviewReport } from "../../../src/features/completion-review/report"
import { buildReviewSidecar } from "../../../src/features/completion-review/report-sidecar"
import { classifyFindings } from "../../../src/features/completion-review/report-taxonomy"
import { deriveGateState } from "../../../src/features/completion-review/report-gate"
import { REVIEW_SIDECAR_VERSION } from "../../../src/features/completion-review/report-types"
import { admission, dimensions, GENERATED_AT, input, progress, scoredDownInput } from "./report-fixtures"

const REQUIRED_PARTS = ["## Summary", "## Score", "## Complexity", "## Required Effort"] as const

describe("renderReviewReport — the four required parts", () => {
  test("renders all four required parts each under its own heading", () => {
    //#given a fully populated review input
    const review = input()

    //#when the report is rendered
    const md = renderReviewReport(review)

    //#then every required heading is present, in order
    for (const part of REQUIRED_PARTS) expect(md).toContain(part)
    const positions = REQUIRED_PARTS.map((p) => md.indexOf(p))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  test("renders the four parts even when calibration data is absent", () => {
    //#given a plan that recorded no effort estimate at all
    const review = input({
      complexity: { planned: null, observed: null, comparison: null, note: "" },
      effort: { planned: null, observed: null, comparison: null, note: "" },
    })

    //#when the report is rendered
    const md = renderReviewReport(review)

    //#then no part is dropped — an absent comparison renders as "not recorded"
    for (const part of REQUIRED_PARTS) expect(md).toContain(part)
    expect(md).toContain("**Planned**: not recorded")
    expect(md).toContain("**Comparison**: not recorded")
  })
})

describe("renderReviewReport — the per-dimension breakdown", () => {
  test("lists all 8 dimensions with kind, weight, result and rationale", () => {
    //#given a scored review
    const review = input()

    //#when rendered
    const md = renderReviewReport(review)

    //#then the Score section has 8 rows, one per rubric dimension
    const rows = md.split("\n").filter((l) => /^\| \d+ \|/.test(l))
    expect(rows).toHaveLength(8)
    expect(md).toContain("| 1 | DoD coverage | DETERMINISTIC | 0.20 |")
    expect(md).toContain("| 2 | Guardrail adherence | MODEL | 0.15 |")
    expect(md).toContain("| 8 | Estimate calibration | MODEL | 0.05 |")
  })

  test("shows an unscorable dimension with its reason and no number", () => {
    //#given a plan whose drift dimension cannot be measured
    const review = input({
      dimensions: dimensions({ "deliverable-drift": { outcome: "unscorable", rationale: "plan records no start commit" } }),
    })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the row reads `unscorable` plus the reason, and the rubric still has 8 rows
    expect(md).toContain("| 5 | Deliverable drift | DETERMINISTIC | 0.10 | unscorable |")
    expect(md).toContain("plan records no start commit")
    const rows = md.split("\n").filter((l) => /^\| \d+ \|/.test(l))
    expect(rows).toHaveLength(8)
  })

  test("renders an unverifiable dimension distinctly from unscorable", () => {
    //#given a dimension with unverifiable evidence
    const review = input({
      dimensions: dimensions({ verifiability: { outcome: "unverifiable", rationale: "no acceptance criteria present" } }),
    })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the row says `unverifiable`, not `unscorable`
    expect(md).toContain("| 6 | Verifiability | MODEL | 0.10 | unverifiable |")
  })

  test("reports the scoring denominator and the partial weight", () => {
    //#given only 5 of 8 dimensions measured
    const review = input({
      dimensions: dimensions({
        "deliverable-drift": { outcome: "unscorable", rationale: "no start commit" },
        "test-decision-honored": { outcome: "unscorable", rationale: "no test decision section" },
        "estimate-calibration": { outcome: "unscorable", rationale: "no recorded estimate" },
      }),
      score: { value: 0.9, grade: 0.8, scoredWeight: 0.75, dimensionCount: 8 },
    })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the denominator is explicit and the shortfall is visible
    expect(md).toContain("**Denominator**: 5 of 8 dimensions scored")
    expect(md).toContain("weight of 0.75 of 1.00")
  })

  test("pairs the continuous score with the APB discrete grade", () => {
    //#given a continuous score that rounds ambiguously by hand
    const review = input({ score: { value: 0.83, grade: 0.8, scoredWeight: 1, dimensionCount: 8 } })

    //#when rendered
    const md = renderReviewReport(review)

    //#then both numbers are present
    expect(md).toContain("**Score**: 0.83 (continuous, 0..1)")
    expect(md).toContain("**APB grade**: 0.8 (discrete companion on {0, 0.2, 0.4, 0.6, 0.8, 1})")
  })
})

describe("buildReviewSidecar — the versioned machine contract", () => {
  test("round-trips through JSON without losing a field", () => {
    //#given a complete review input
    const review = input()

    //#when the sidecar is built and serialised then parsed back
    const sidecar = buildReviewSidecar(review)
    const roundTripped: unknown = JSON.parse(JSON.stringify(sidecar))

    //#then the parsed object is structurally identical to the original
    expect(roundTripped).toEqual(sidecar as unknown)
  })

  test("carries an explicit version the corpus reader can gate on", () => {
    //#given a review input
    const review = input()

    //#when the sidecar is built
    const sidecar = buildReviewSidecar(review)

    //#then a semver version is present and matches the exported constant
    expect(sidecar.sidecarVersion).toBe(REVIEW_SIDECAR_VERSION)
    expect(sidecar.sidecarVersion).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test("exposes every dimension, its outcome and its codes — no prose parsing", () => {
    //#given a scored-down review
    const review = scoredDownInput()
    review.findings = classifyFindings(review.dimensions)

    //#when the sidecar is built
    const sidecar = buildReviewSidecar(review)

    //#then all 8 dimensions are present with machine-readable outcomes
    expect(sidecar.dimensions).toHaveLength(8)
    for (const d of sidecar.dimensions) {
      expect(typeof d.id).toBe("string")
      expect(["DETERMINISTIC", "MODEL"]).toContain(d.kind)
      expect(["scored", "unscorable", "unverifiable"]).toContain(d.outcome)
      expect(Array.isArray(d.codes)).toBe(true)
    }
    expect(sidecar.dimensions.map((d) => d.id)).toEqual([
      "dod-coverage",
      "guardrail-adherence",
      "goal-attainment",
      "completeness",
      "deliverable-drift",
      "verifiability",
      "test-decision-honored",
      "estimate-calibration",
    ])
  })

  test("carries `advisory: true` so a reader cannot mistake it for a gate result", () => {
    //#given a review input
    const review = input()

    //#when the sidecar is built
    const sidecar = buildReviewSidecar(review)

    //#then the flag is set
    expect(sidecar.advisory).toBe(true)
  })
})

describe("classifyFindings — the E1–E6 taxonomy", () => {
  test("assigns a code to every dimension scored down", () => {
    //#given a review where DoD, drift, test-decision and one model dimension are all short
    const review = scoredDownInput()

    //#when findings are classified
    const findings = classifyFindings(review.dimensions)

    //#then every scored-down dimension carries at least one code
    const coded = new Set(findings.map((f) => f.dimensionId))
    for (const d of review.dimensions) {
      if (d.outcome === "scored" && d.score !== null && d.score < 1) {
        expect(coded).toContain(d.id)
      }
    }
  })

  test("emits E1 for unverifiable DoD items, E2 for failures and E3 for the gap", () => {
    //#given DoD signals showing one failure, one unverifiable and a real gap
    const review = scoredDownInput()

    //#when classified
    const codes = classifyFindings(review.dimensions).map((f) => f.code)

    //#then all three DoD codes appear
    expect(codes).toContain("E1")
    expect(codes).toContain("E2")
    expect(codes).toContain("E3")
  })

  test("emits E4 for drift and E5 for a broken test decision", () => {
    //#given drift and the test decision both short
    const review = scoredDownInput()

    //#when classified
    const findings = classifyFindings(review.dimensions)

    //#then E4 and E5 are attached to the right dimensions
    expect(findings.find((f) => f.code === "E4")?.dimensionId).toBe("deliverable-drift")
    expect(findings.find((f) => f.code === "E5")?.dimensionId).toBe("test-decision-honored")
  })

  test("emits no finding when every dimension scored a perfect 1", () => {
    //#given a review where every dimension scored 1.0
    const perfect = dimensions()
    const review = input({ dimensions: perfect.map((d) => ({ ...d, score: 1 })) })

    //#when classified
    const findings = classifyFindings(review.dimensions)

    //#then the taxonomy is empty
    expect(findings).toHaveLength(0)
  })

  test("renders a code in the report table next to the dimension it belongs to", () => {
    //#given a scored-down review with findings attached
    const base = scoredDownInput()
    const review = { ...base, findings: classifyFindings(base.dimensions) }

    //#when rendered
    const md = renderReviewReport(review)

    //#then the row for DoD coverage carries its codes in the Codes column
    const dodRow = md.split("\n").find((l) => l.startsWith("| 1 | DoD coverage |"))
    expect(dodRow).toBeDefined()
    expect(dodRow).toContain("E1")
    expect(dodRow).toContain("E2")
    expect(dodRow).toContain("E3")
  })
})

describe("the admission gate", () => {
  test("renders `gateDisagreement` when the plan and the signals disagree", () => {
    //#given a plan marked complete with only one corroborating signal
    const review = input({ progress: progress({ isComplete: true }), admission: admission(1) })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the disagreement is named, not silently omitted
    expect(md).toContain("**Gate state**: disagree")
    expect(md).toContain("## Admission Gate")
    expect(md).toContain("The two signals disagree")
  })

  test('renders gateEvidence: "unavailable" when corroboration is structurally absent', () => {
    //#given a vacuously-complete zero-task plan: no corroboration at all
    const review = input({
      progress: progress({ total: 0, completed: 0, remaining: 0, isComplete: true, needsTriage: true }),
      admission: admission(0),
    })

    //#when rendered
    const md = renderReviewReport(review)

    //#then unavailability is stated explicitly and distinguished from disagreement
    expect(md).toContain('**Gate evidence**: unavailable')
    expect(md).toContain('gateEvidence: "unavailable"')
    expect(md).toContain("structurally absent")
    expect(md).toContain("needs triage")
  })

  test("derives `agree` only when both independent signals corroborate", () => {
    //#given a complete plan with both signals present
    const state = deriveGateState(progress({ isComplete: true }), admission(2))

    //#then the gate agrees and evidence is corroborated
    expect(state.state).toBe("agree")
    expect(state.evidence).toBe("corroborated")
  })

  test("reports `unavailable`, not `disagree`, when corroboration is structurally absent", () => {
    //#given a plan marked complete with NO terminal task records and NO notepad stamps
    const state = deriveGateState(progress({ isComplete: true }), admission(0))

    //#then absence is not conflict — there is no second signal to disagree with
    expect(state.state).toBe("unavailable")
    expect(state.evidence).toBe("unavailable")
    // the `unavailable` clause negates the conflict in words ("nothing to disagree
    // with"), so the assertion targets the CLAIM, not the bare token
    expect(state.detail).not.toContain("The two signals disagree")
    expect(state.detail).not.toContain("ground truth")
    expect(state.detail).toContain("structurally absent")
  })

  test("never reports `agree` from a single signal", () => {
    //#given a complete plan with only one signal
    const state = deriveGateState(progress({ isComplete: true }), admission(1))

    //#then it is a disagreement, not agreement
    expect(state.state).toBe("disagree")
    expect(state.evidence).toBe("unavailable")
  })
})

describe("purity", () => {
  test("two renders of identical input are byte-identical", () => {
    //#given one fixed input with a supplied timestamp
    const review = input()

    //#when rendered twice
    const first = renderReviewReport(review)
    const second = renderReviewReport(review)

    //#then the bytes match, so a corpus reader can diff two reports
    expect(first).toBe(second)
  })

  test("the timestamp is rendered from the input, not read from a clock", () => {
    //#given two reviews differing ONLY in the caller-supplied timestamp
    const a = input({ generatedAt: "2026-01-01T00:00:00.000Z" })
    const b = input({ generatedAt: "2026-12-31T23:59:59.000Z" })

    //#when both are rendered
    const mdA = renderReviewReport(a)
    const mdB = renderReviewReport(b)

    //#then each carries its own timestamp and nothing else differs
    expect(mdA).toContain("2026-01-01T00:00:00.000Z")
    expect(mdB).toContain("2026-12-31T23:59:59.000Z")
    expect(mdA.replace("2026-01-01T00:00:00.000Z", "X")).toBe(mdB.replace("2026-12-31T23:59:59.000Z", "X"))
  })

  test("the report states the plan is never written into", () => {
    //#given any review
    const review = input()

    //#when rendered
    const md = renderReviewReport(review)

    //#then the split is declared
    expect(md).toContain("**Report is not written into the plan file**")
  })
})

describe("the advisory statement", () => {
  test("says a low score is advisory, not a gate, verbatim", () => {
    //#given a review whose score is very low
    const review = input({ score: { value: 0.05, grade: 0.2, scoredWeight: 1, dimensionCount: 8 } })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the caveat is present and the report is still produced in full
    expect(md).toContain("**A low score is advisory, not a gate.**")
    expect(md).toContain("no exit code, no blocking error and no contract rule")
    for (const part of REQUIRED_PARTS) expect(md).toContain(part)
  })
})

describe("provenance honesty", () => {
  test("renders the gatherer's heuristic labels and never upgrades them", () => {
    //#given a legacy plan backed only by a convention file
    const review = input({ coverageClass: "legacy", provenance: { gather: { linkage: "heuristic", checkboxSync: "heuristic" }, evidence: ["file presence only (convention)"] } })

    //#when rendered
    const md = renderReviewReport(review)

    //#then the weak provenance is stated as-is, and the report says so
    expect(md).toContain("**Task→plan linkage**: heuristic")
    expect(md).toContain("**Checkbox sync**: heuristic")
    expect(md).toContain("**Evidence provenance**: file presence only (convention)")
    expect(md).toContain("**Coverage class**: legacy")
    expect(md).toContain("never promoted")
  })
})

describe("summary", () => {
  test("is three to five sentences built from facts", () => {
    //#given a fully populated review
    const review = input()

    //#when rendered
    const md = renderReviewReport(review)

    //#then the Summary holds 3–5 sentences
    const section = md.split("## Summary")[1].split("## Score")[0].trim()
    const sentences = section.split(/(?<=\.)\s+/).filter((s) => s.length > 0)
    expect(sentences.length).toBeGreaterThanOrEqual(3)
    expect(sentences.length).toBeLessThanOrEqual(5)
    expect(section).toContain("demo-plan")
  })

  test("says the generated timestamp came from the caller", () => {
    //#given a review
    const review = input()

    //#when rendered
    const md = renderReviewReport(review)

    //#then the header documents that the renderer reads no clock
    expect(md).toContain("**Generated**: " + GENERATED_AT)
    expect(md).toContain("the renderer reads no clock")
  })
})
