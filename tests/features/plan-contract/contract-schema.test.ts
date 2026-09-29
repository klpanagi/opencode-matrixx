/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { MAX_PLAN_FILE_BYTES } from "../../../src/features/mission-state/constants"
import {
  parsePlanContract,
  PlanContractSchema,
  validatePlanContract,
} from "../../../src/features/plan-contract"

/**
 * The live corpus lives in the gitignored `.matrixx/plans/` directory, so CI may
 * not have it. Resolve it RELATIVE TO THIS FILE (never an absolute temp path) and
 * fall back to the committed fixture so the assertions still have something to
 * chew on when the corpus is absent.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const CORPUS_DIR = join(REPO_ROOT, ".matrixx", "plans")

function collectCorpusPlans(): { name: string; content: string }[] {
  const live = existsSync(CORPUS_DIR)
    ? readdirSync(CORPUS_DIR)
        .filter((entry) => entry.endsWith(".md"))
        .map((entry) => ({ name: entry, content: readFileSync(join(CORPUS_DIR, entry), "utf8") }))
    : []
  const fixture = {
    name: "conformant-plan.md",
    content: readFileSync(new URL("../../fixtures/plan-contract/conformant-plan.md", import.meta.url), "utf8"),
  }
  // A corpus of exactly one committed fixture still proves the shape; de-dup in
  // case the live corpus happens to contain a same-named file.
  return [...live.filter((plan) => plan.name !== fixture.name), fixture]
}

const CORPUS = collectCorpusPlans()

describe("PlanContractSchema against the real plan corpus", () => {
  test("a non-empty corpus is available to test against", () => {
    //#given the live corpus directory (gitignored) plus the committed fixture
    //#when collecting plans
    const plans = CORPUS

    //#then the sweep has real material rather than an empty loop
    expect(plans.length).toBeGreaterThan(0)
  })

  test("every live plan parses into a schema-shaped contract", () => {
    //#given every plan in the corpus
    //#when parsing each one and validating the result against the schema
    const failures = CORPUS.flatMap(({ name, content }) => {
      const parsed = PlanContractSchema.safeParse(parsePlanContract(content))
      if (parsed.success) return []
      return [
        `${name}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`,
      ]
    })

    //#then no plan is rejected — the schema describes reality
    expect(failures).toEqual([])
  })

  test("the schema is not vacuous: it rejects a contract with a blank section title", () => {
    //#given a contract whose section list contains an empty title
    const contract = { sections: ["TL;DR", ""], tasks: [], dod: [], frontMatter: undefined }

    //#when validating it against the schema
    const result = PlanContractSchema.safeParse(contract)

    //#then the schema rejects it on the section title, proving sections are constrained
    expect(result.success).toBe(false)
  })

  test("the schema is not vacuous: it rejects tasks whose line numbers do not ascend", () => {
    //#given a contract whose tasks are not in document order
    const contract = {
      sections: [],
      tasks: [
        { n: 2, title: "second", checked: false, line: 9, anchor: "9#abc" },
        { n: 1, title: "first", checked: false, line: 3, anchor: "3#def" },
      ],
      dod: [],
    }

    //#when validating it against the schema
    const result = PlanContractSchema.safeParse(contract)

    //#then the document-order invariant is enforced, not merely typed
    expect(result.success).toBe(false)
  })

  test("a plan with front-matter yields a populated frontMatter, and the schema still accepts it", () => {
    //#given a plan carrying a leading YAML front-matter block
    const content = "---\nstatus: in_progress\nrevision: 3\nphase: \"2\"\n---\n# Plan\n\n## TL;DR\n\n- [ ] 1. T\n"

    //#when parsing it
    const contract = parsePlanContract(content)

    //#then frontMatter is populated (not undefined) and the result is schema-shaped
    expect(contract.frontMatter).toBeDefined()
    expect(contract.frontMatter?.status).toBe("in_progress")
    expect(contract.frontMatter?.revision).toBe(3)
    expect(contract.frontMatter?.phase).toBe("2")
    expect(PlanContractSchema.safeParse(contract).success).toBe(true)
  })

  test("a plan without front-matter leaves frontMatter undefined rather than inventing one", () => {
    //#given a plan with no front-matter block
    const content = "# Plan\n\n## TL;DR\n\n- [ ] 1. T\n"

    //#when parsing it
    const contract = parsePlanContract(content)

    //#then frontMatter stays undefined and the contract still satisfies the schema
    expect(contract.frontMatter).toBeUndefined()
    expect(PlanContractSchema.safeParse(contract).success).toBe(true)
  })
})

describe("validatePlanContract schema gate", () => {
  test("a schema failure is a WARNING and ok stays true", () => {
    //#given content that parses into a contract the schema rejects
    //      (a blank section title comes from a heading that normalizes to empty)
    const content = `## TL;DR\n\n- [ ] 1. T\n\n## (MANDATORY)\n\nbody\n`

    //#when validating
    const result = validatePlanContract(content)

    //#then the drift is surfaced as a warning, never as an error
    const warning = result.warnings.find((w) => w.code === "contract_schema_mismatch")
    expect(warning).toBeDefined()
    expect(warning?.message).toContain("sections")
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("a schema-clean plan emits no contract_schema_mismatch warning", () => {
    //#given a conformant plan
    const content = readFileSync(
      new URL("../../fixtures/plan-contract/conformant-plan.md", import.meta.url),
      "utf8",
    )

    //#when validating
    const result = validatePlanContract(content)

    //#then the schema gate stays silent
    expect(result.warnings.some((w) => w.code === "contract_schema_mismatch")).toBe(false)
    expect(result.ok).toBe(true)
  })

  test("a conforming corpus plan produces no schema-mismatch warning", () => {
    //#given every plan in the corpus
    //#when validating each one
    const offenders = CORPUS.filter(({ content }) =>
      validatePlanContract(content).warnings.some((w) => w.code === "contract_schema_mismatch"),
    )

    //#then no real plan trips the gate
    expect(offenders.map((plan) => plan.name)).toEqual([])
  })
})

describe("approaching_size_cap prominence", () => {
  test("fires for a plan above 90% of the cap and NAMES the oversized section", () => {
    //#given a plan just above 90% of the cap, with the bulk inside one H2
    const padding = "x".repeat(Math.ceil(MAX_PLAN_FILE_BYTES * 0.91))
    const content = `## TL;DR\n\n- [ ] 1. T\n\n## Context\n\n${padding}\n\n## Success Criteria\n\ndone\n`

    //#when validating
    const result = validatePlanContract(content)

    //#then the advisory fires, stays advisory, and points at the section to trim
    const warning = result.warnings.find((w) => w.code === "approaching_size_cap")
    expect(warning).toBeDefined()
    expect(warning?.message).toContain("Context")
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  test("does not fire for a plan comfortably under the cap", () => {
    //#given a small plan
    const content = "## TL;DR\n\n- [ ] 1. T\n\n## Success Criteria\n\ndone\n"

    //#when validating
    const result = validatePlanContract(content)

    //#then the size advisory stays quiet
    expect(result.warnings.some((w) => w.code === "approaching_size_cap")).toBe(false)
  })
})
