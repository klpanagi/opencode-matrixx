/**
 * Task 5 — the eight dimensions, as a tagged table.
 *
 * Weights sum to exactly 1.0 so the weighted mean is a mean. The `kind` on each
 * entry is checked by `checkRubricStructure` and, more importantly, by the type
 * system: a DETERMINISTIC entry here is only expressible WITH a `compute`.
 */

import { computeDoDCoverage } from "./rubric-dod"
import { computeDeliverableDrift } from "./rubric-drift"
import { computeTestDecisionHonored } from "./rubric-test-decision"
import type { RubricDimension } from "./rubric-types"

export const RUBRIC_DIMENSIONS: readonly RubricDimension[] = [
  {
    index: 1,
    id: "dod-coverage",
    title: "DoD coverage",
    kind: "DETERMINISTIC",
    weight: 0.2,
    description:
      "Plan Definition-of-Done lines against machine-written completions. Reports all-pass, avg-pass and the gap between them.",
    compute: computeDoDCoverage,
  },
  {
    index: 2,
    id: "guardrail-adherence",
    title: "Guardrail adherence",
    kind: "MODEL",
    weight: 0.15,
    description: "Did execution respect the plan's Must NOT Have (Guardrails) section?",
  },
  {
    index: 3,
    id: "goal-attainment",
    title: "Goal attainment",
    kind: "MODEL",
    weight: 0.15,
    description: "Was the plan's stated goal actually attained by what was delivered?",
  },
  {
    index: 4,
    id: "completeness",
    title: "Completeness",
    kind: "MODEL",
    weight: 0.15,
    description: "What share of the plan's stated requirements is covered by the delivery?",
  },
  {
    index: 5,
    id: "deliverable-drift",
    title: "Deliverable drift",
    kind: "DETERMINISTIC",
    weight: 0.1,
    description: "Share of Concrete Deliverables paths that appear in the actual git diff.",
    compute: computeDeliverableDrift,
  },
  {
    index: 6,
    id: "verifiability",
    title: "Verifiability",
    kind: "MODEL",
    weight: 0.1,
    description: "Are the plan's acceptance criteria checkable at all, by anything?",
  },
  {
    index: 7,
    id: "test-decision-honored",
    title: "Test decision honored",
    kind: "DETERMINISTIC",
    weight: 0.1,
    description: "Did the plan's own Test Decision hold in execution?",
    compute: computeTestDecisionHonored,
  },
  {
    index: 8,
    id: "estimate-calibration",
    title: "Estimate calibration",
    kind: "MODEL",
    weight: 0.05,
    description:
      "Plan-time estimated effort against observed execution. Re-tagged from DETERMINISTIC: an ordinal-vs-ordinal over/under call is a model read.",
  },
]

/** The `kind` split as declared, for the structure gate and for tests. */
export const RUBRIC_KIND_PATTERN: readonly RubricDimension["kind"][] = [
  "DETERMINISTIC",
  "MODEL",
  "MODEL",
  "MODEL",
  "DETERMINISTIC",
  "MODEL",
  "DETERMINISTIC",
  "MODEL",
]
