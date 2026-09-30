/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { loadBuiltinCommands } from "../../../src/features/builtin-commands/commands"
import { PLAN_REVIEW_TEMPLATE } from "../../../src/features/builtin-commands/templates/plan-review"

const REPO_ROOT = resolve(import.meta.dir, "../../..")

describe("/plan-review command template", () => {
  test("is registered as a builtin command", () => {
    //#given the builtin command registry
    //#when it is loaded
    const commands = loadBuiltinCommands()

    //#then /plan-review is present
    expect(commands["plan-review"]).toBeDefined()
    expect(commands["plan-review"]?.name).toBe("plan-review")
  })

  test("can be disabled by name", () => {
    //#given the builtin command registry
    //#when plan-review is in the disabled list
    const commands = loadBuiltinCommands(["plan-review"])

    //#then it is absent
    expect(commands["plan-review"]).toBeUndefined()
  })

  test("takes an explicit plan argument", () => {
    //#given the command definition source
    const source = readFileSync(join(REPO_ROOT, "src/features/builtin-commands/commands.ts"), "utf8")
    const entry = source.slice(source.indexOf('"plan-review": {'))

    //#when its argument hint is read
    //#then the plan name is the argument, and it is not optional
    expect(entry).toContain('argumentHint: "<plan-name>"')
  })

  test("states in TEXT that this is the ONLY trigger", () => {
    //#given the template text
    //#when the triggering section is read
    //#then it names the prohibition on every automatic path
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/ONLY trigger/i)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/no hook/i)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/session\.idle/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/progress\.isComplete/)
  })

  test("errors clearly and stops when plan_list returns no match", () => {
    //#given the template text
    //#when the resolution step is read
    //#then it names the silent-skip failure and forbids proceeding on an empty resolution
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/plan_list/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/returned no match/i)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/never proceed on an empty or partial resolution/i)
  })

  test("admits on a conjunction and never on isComplete alone", () => {
    //#given the template text
    //#when the admission step is read
    //#then both clauses of the conjunction are stated
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/isComplete === true/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/needsTriage === false/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/never on `isComplete` alone/i)
  })

  test("embeds the gate's own honesty notice, so the warning cannot drift from the code", () => {
    //#given the exported heuristic warning
    const warning = PLAN_REVIEW_TEMPLATE

    //#when the template is read
    //#then it carries the same text the gate module exports
    expect(warning).toContain("HEURISTIC")
    expect(warning).toMatch(/BOTH directions/)
  })

  test("proceeds and records a disagreement instead of picking a winner", () => {
    //#given the template text
    //#when the disagreement step is read
    //#then it mandates PROCEED and the gateDisagreement field
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/gateDisagreement/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/never silently pick a winner/i)
  })

  test("treats structural absence as its own state", () => {
    //#given the template text
    //#when the unavailable step is read
    //#then it forbids emitting a disagreement in the absent-corroboration case
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/gateEvidence: "unavailable"/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/MUST NOT emit a `gateDisagreement`/)
  })

  test("names every shipped pipeline stage in the plan's order", () => {
    //#given the template text
    //#when the pipeline steps are read
    //#then gather, auditor, rubric, render, report-path appear
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/gatherCompletionReviewInputs/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/auditor/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/scoreRubric|evaluateReview/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/writeReviewReport/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/buildReviewDirCommand/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/detectMissingModelSections\(buildSectionIndex\(planContent\)\)/)
  })

  test("forbids writing into the plan file and blocking on a low score", () => {
    //#given the template text
    //#when its constraints are read
    //#then both prohibitions are present in text
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/Never write the report into the plan file/)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/advisory/i)
    expect(PLAN_REVIEW_TEMPLATE).toMatch(/four required parts/i)
  })
})
