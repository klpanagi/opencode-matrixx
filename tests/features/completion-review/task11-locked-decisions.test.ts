/// <reference types="bun-types" />
/**
 * Task 11 — the FINAL locked-decision audit, asserted as executable tests.
 *
 * A locked decision that is only checked by a shell one-off decays: the next
 * task changes a file, the note above it rots, and nobody notices until the
 * decision it was protecting has been quietly reversed. So each decision here
 * is a test that FAILS if the decision is broken.
 *
 * SIX DECISIONS:
 *   1. `src/agents/smith.ts` is byte-frozen — Smith is the PRE-execution
 *      reviewer; `auditor` is the POST-execution one. They coexist.
 *   2. `src/hooks/architect/event-handler.ts` is byte-frozen.
 *   3. No hook / plugin-handler / plugin module reaches the reviewer.
 *   4. The plan-file size cap is defined EXACTLY ONCE, value unchanged.
 *   5. The plan contract stays permanently advisory (`errors.push` count 1,
 *      no `mode: "fail"`).
 *   6. A low score produces a report and never a block.
 *
 * WHY DECISIONS 1 AND 2 PIN A CONTENT HASH RATHER THAN `git diff`: after the
 * change is committed `git diff` is empty for EVERY file, including files that
 * were edited and committed. A pinned hash keeps asserting the byte state
 * forever; `git diff` stops asserting anything the moment it lands.
 *
 * NOTE ON DECISION 4: the plan body says the cap constant is defined in two
 * files and its acceptance criterion expects two hits. That is STALE. The
 * predecessor plan (`plan-section-addressing`, PR #147) deliberately
 * deduplicated it — `src/tools/plan/constants.ts` is now a re-export barrel.
 * The correct invariant is ONE definition with an unchanged VALUE, which is
 * what this file asserts. See the comment at the cap test for the full note.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, relative, resolve } from "node:path"

import { MAX_PLAN_FILE_BYTES } from "../../../src/features/mission-state/constants"
import * as planConstants from "../../../src/tools/plan/constants"
import { writeReviewReport } from "../../../src/features/completion-review/report-write"
import { dimensions, input } from "./report-fixtures"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const SRC = join(REPO_ROOT, "src")

/** md5 of a repo file, from disk. */
function md5Of(relativePath: string): string {
  return createHash("md5").update(readFileSync(join(REPO_ROOT, relativePath))).digest("hex")
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".test.ts")) acc.push(full)
  }
  return acc
}

describe("locked decision #1 — Smith is byte-frozen", () => {
  test("src/agents/smith.ts is unchanged from pre-Plan-B", () => {
    //#given the Smith prompt as it stood before the post-execution reviewer existed
    const FROZEN_MD5 = "9adb9616229ee53739a57cc3ed15b16c"

    //#when its bytes are hashed
    const actual = md5Of("src/agents/smith.ts")

    //#then the file is untouched — the pre-execution reviewer still exists, and
    //#then the new agent ADDS a reviewer rather than replacing one
    expect(actual).toBe(FROZEN_MD5)
  })

  test("Smith and Auditor are DISTINCT agents, both present", () => {
    //#given both agent sources
    const smith = readFileSync(join(SRC, "agents/smith.ts"), "utf-8")
    const auditor = readFileSync(join(SRC, "agents/auditor.ts"), "utf-8")

    //#when their declared names are compared
    //#then the new agent did not take over Smith's identity
    expect(smith).toContain("smith")
    expect(auditor).toContain("auditor")
    expect(auditor).not.toBe(smith)
  })
})

describe("locked decision #2 — the architect event handler is byte-frozen", () => {
  test("src/hooks/architect/event-handler.ts is unchanged", () => {
    //#given the architect hook as it stood before Plan B
    const FROZEN_MD5 = "da354664312b93b3e95f2a1cfd1cd26b"

    //#when its bytes are hashed
    const actual = md5Of("src/hooks/architect/event-handler.ts")

    //#then adding a post-execution reviewer did not perturb the execution path
    expect(actual).toBe(FROZEN_MD5)
  })

  test("src/agents/architect/default.ts is unchanged", () => {
    //#given the architect default agent as it stood before Plan B
    const FROZEN_MD5 = "8038fa9c6e2cb2c6a11a9c3c68b69a07"

    //#when its bytes are hashed
    const actual = md5Of("src/agents/architect/default.ts")

    //#then the plan EXECUTOR was not repurposed as the plan REVIEWER
    expect(actual).toBe(FROZEN_MD5)
  })
})

describe("locked decision #3 — the reviewer is reachable only by explicit command", () => {
  test("no module under an automation surface imports completion-review/**", () => {
    //#given the src/ module graph
    //#when every import specifier is walked and filtered to the feature
    const AUTOMATION_DIRS = ["hooks", "plugin-handlers", "plugin", "tools", "cli"]
    const offenders: string[] = []
    for (const dir of AUTOMATION_DIRS) {
      for (const file of walk(join(SRC, dir))) {
        const source = readFileSync(file, "utf-8")
        const specifiers = [...source.matchAll(/from\s+"(\.[^"]*)"/g)].map((m) => m[1] ?? "")
        if (specifiers.some((s) => s.includes("completion-review"))) {
          offenders.push(relative(SRC, file))
        }
      }
    }

    //#then no hook, tool, handler or CLI path can fire a review on its own
    expect(offenders).toEqual([])
  })

  test("the sole importer is the /plan-review command template", () => {
    //#given the src/ module graph
    //#when every external importer of the feature is collected
    const FEATURE = join(SRC, "features/completion-review")
    const importers = new Set<string>()
    for (const file of walk(SRC)) {
      if (file.startsWith(FEATURE)) continue
      const source = readFileSync(file, "utf-8")
      for (const match of source.matchAll(/from\s+"(\.[^"]*)"/g)) {
        if ((match[1] ?? "").includes("completion-review")) importers.add(relative(SRC, file))
      }
    }

    //#then exactly one file imports it, and it is the command template
    expect([...importers].sort()).toEqual(["features/builtin-commands/templates/plan-review.ts"])
  })
})

describe("locked decision #4 — the plan-file cap is defined once, with its value intact", () => {
  /**
   * PLAN-TEXT DISCREPANCY, RECORDED DELIBERATELY.
   *
   * The plan body states the cap is defined in BOTH `mission-state/constants.ts`
   * and `tools/plan/constants.ts`, and its acceptance criterion expects exactly
   * two grep hits. That text is STALE. The predecessor plan
   * (`plan-section-addressing`, PR #147) deliberately deduplicated the constant
   * and turned `src/tools/plan/constants.ts` into a re-export barrel with an
   * explicit "MUST NEVER re-declare" comment.
   *
   * The assertion below is the CORRECT one: ONE definition, value unchanged.
   * Adding a second definition to satisfy stale plan prose would re-introduce
   * the exact duplication Plan A removed — the plan text is wrong, not the code.
   */
  test("exactly ONE definition of the cap literal exists in src/", () => {
    //#given every TypeScript source file
    //#when all occurrences of the cap literal are counted, per file
    const hits: string[] = []
    for (const file of walk(SRC)) {
      const source = readFileSync(file, "utf-8")
      if (/102[,_]?400/.test(source)) hits.push(relative(SRC, file))
    }

    //#then only the owning module mentions it — no second definition crept back
    expect(hits).toEqual(["features/mission-state/constants.ts"])
  })

  test("the cap VALUE is unchanged and is re-exported, never redefined", () => {
    //#given the owning module and the plan-tool barrel
    //#when the cap is read from each
    const owner = readFileSync(join(SRC, "features/mission-state/constants.ts"), "utf-8")
    const barrel = readFileSync(join(SRC, "tools/plan/constants.ts"), "utf-8")

    //#then the value is the one the cap was locked at, from a single definition
    expect(MAX_PLAN_FILE_BYTES).toBe(102_400)
    expect(owner).toMatch(/export const MAX_PLAN_FILE_BYTES = 102_400/)
    //#then the barrel re-exports rather than re-declares
    expect(planConstants.MAX_PLAN_FILE_BYTES).toBe(102_400)
    expect(barrel).not.toMatch(/(const|let|var)\s+MAX_PLAN_FILE_BYTES/)
  })
})

describe("locked decision #5 — the plan contract stays permanently advisory", () => {
  test("validate.ts has exactly one errors.push, so nothing can hard-fail a plan", () => {
    //#given the contract validator
    const source = readFileSync(
      join(SRC, "features/plan-contract/validate.ts"),
      "utf-8",
    )

    //#when its error pushes are counted
    const pushes = source.match(/errors\.push/g) ?? []

    //#then exactly one exists — a non-empty-plan advisory, nothing more
    expect(pushes).toHaveLength(1)
  })

  test("there is no fail mode: no mode: \"fail\" and no severity escalation", () => {
    //#given the contract module
    const source = readFileSync(
      join(SRC, "features/plan-contract/validate.ts"),
      "utf-8",
    )

    //#when it is scanned for an escalation path
    //#then the contract cannot be promoted back into a gate
    expect(source).not.toMatch(/mode\s*:\s*"fail"/)
    expect(source).not.toMatch(/mode\s*:\s*'fail'/)
  })
})

describe("locked decision #6 — a low score is advisory, never a block", () => {
  test("a 0.1 score still writes a report and returns no error", () => {
    //#given a fully-scored review carrying a very low headline score
    const lowScore = input({
      score: { value: 0.1, grade: 0.2, scoredWeight: 1, dimensionCount: 8 },
      dimensions: dimensions({ "dod-coverage": { score: 0.1, rationale: "most DoD items unverified" } }),
    })

    //#when it is written
    const result = writeReviewReport(lowScore)

    //#then the write SUCCEEDS — a low number is a finding, not a failure
    expect(result.ok).toBe(true)
    expect(result.error).toBeNull()
  })

  test("the report states the number AND the advisory caveat together", () => {
    //#given a low-score review
    const lowScore = input({ score: { value: 0.1, grade: 0.2, scoredWeight: 1, dimensionCount: 8 } })

    //#when the report is rendered
    const result = writeReviewReport(lowScore)

    //#then the score is visible and the advisory notice is on the same page
    expect(result.markdown).toContain("## Score")
    expect(result.markdown).toContain("0.10")
    expect(result.markdown).toContain("advisory, not a gate")
    //#then all four required parts are present regardless of the score
    for (const heading of ["## Summary", "## Score", "## Complexity", "## Required Effort"]) {
      expect(result.markdown).toContain(heading)
    }
  })

  test("the sidecar marks the review advisory:true whatever the score", () => {
    //#given a low-score review
    const lowScore = input({ score: { value: 0.1, grade: 0.2, scoredWeight: 1, dimensionCount: 8 } })

    //#when the sidecar is built
    const result = writeReviewReport(lowScore)
    const sidecar = JSON.parse(result.sidecarJson) as { advisory: boolean; score: { value: number } }

    //#then advisory is a CONSTANT true, and no field encodes a block
    expect(sidecar.advisory).toBe(true)
    expect(sidecar.score.value).toBe(0.1)
  })
})
