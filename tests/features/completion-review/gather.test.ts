/// <reference types="bun-types" />
/**
 * Task 2 — the deterministic data-gathering layer.
 *
 * Every assertion below is a NON-GOAL made executable:
 *   - heuristic inputs are labelled, not trusted
 *   - DoD never merges into `isComplete`
 *   - vacuous completeness is surfaced, never smoothed
 *   - `_archive/` is never a reviewable plan
 *   - incomplete attribution DEGRADES, it never scores
 *   - admission corroboration is an independent conjunction input
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  ATTRIBUTION_DEPENDENT_DIMENSIONS,
  type GatherSources,
  type GitRunner,
  gatherCompletionReviewInputs,
  gatherReviewablePlans,
  readGatherSourceComments,
} from "../../../src/features/completion-review/gather"
import {
  makeTempRoot,
  notepadContent,
  numberedPlan,
  removeTempRoot,
  runtimeTaskFile,
  writeFile,
  zeroCheckboxPlan,
} from "./gather-fixtures"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const GATHER_DIR = join(REPO_ROOT, "src/features/completion-review")

const ATTRIBUTION_REASON = "attribution incomplete — linked terminal tasks do not account for the plan's tasks"

let root = ""
const PLAN_NAME = "fixture-plan"

beforeAll(() => {
  root = makeTempRoot("main")
  writeFile(root, `.matrixx/plans/${PLAN_NAME}.md`, numberedPlan({ checked: 1, total: 3 }))
  writeFile(
    root,
    `.matrixx/tasks/T-11111111-1111-4111-8111-111111111111.json`,
    JSON.stringify(
      runtimeTaskFile({
        id: "T-11111111-1111-4111-8111-111111111111",
        subject: "task number 1",
        status: "completed",
        planName: PLAN_NAME,
        projectRoot: root,
      }),
      null,
      2,
    ),
  )
  writeFile(
    root,
    `.matrixx/notepads/${PLAN_NAME}/T-11111111-1111-4111-8111-111111111111.md`,
    notepadContent({ taskId: "T-11111111-1111-4111-8111-111111111111", stamped: true }),
  )
})

afterAll(() => {
  removeTempRoot(root)
})

/** Deterministic, offline git stand-in. No VCS is ever invoked by a test. */
const fakeGit: GitRunner = (args) => {
  if (args.includes("--name-status")) return "M\tsrc/a.ts\nA\tsrc/b.ts\n"
  if (args.includes("--stat")) return " src/a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n"
  return ""
}

function sources(overrides: Partial<GatherSources> = {}): GatherSources {
  return { directory: root, runGit: fakeGit, ...overrides }
}

describe("gatherCompletionReviewInputs — provenance labelling", () => {
  test("labels task-to-plan linkage and checkbox sync as heuristic", () => {
    //#given a plan with one completed task and one linked terminal runtime task
    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources())

    //#then both soft inputs are visibly soft
    expect(gathered.provenance.linkage).toBe("heuristic")
    expect(gathered.provenance.checkboxSync).toBe("heuristic")
  })

  test("a source comment states checkboxOverlap is NOT ground truth", () => {
    //#given the gatherer's own source files
    //#when their comments are read
    const comments = readGatherSourceComments(GATHER_DIR)

    //#then the non-goal is written down, not merely intended
    expect(comments).toMatch(/checkboxOverlap/)
    expect(comments).toMatch(/NOT ground truth/i)
  })
})

describe("gatherCompletionReviewInputs — purity", () => {
  test("is a pure function: two runs over identical inputs are deeply equal", () => {
    //#given identical sources
    const input = sources()

    //#when the gatherer runs twice
    const first = gatherCompletionReviewInputs(input)
    const second = gatherCompletionReviewInputs(input)

    //#then no clock, no randomness, no accumulated state
    expect(second).toEqual(first)
  })

  test("involves no model, no network, and no mutation", () => {
    //#given every source file of the gatherer
    const files = readdirSync(GATHER_DIR).filter((f) => f.startsWith("gather"))
    expect(files.length).toBeGreaterThan(0)

    //#when the imports are inspected
    const sourcesText = files.map((f) => readFileSync(join(GATHER_DIR, f), "utf-8")).join("\n")

    //#then nothing model-shaped, network-shaped, or write-shaped is imported
    expect(sourcesText).not.toMatch(/from "(ai|@ai-sdk|@opencode-ai\/ai)"/)
    expect(sourcesText).not.toMatch(/from "node:(http|https|net)"/)
    expect(sourcesText).not.toMatch(/\b(mkdirSync|writeFileSync|appendFileSync|rmSync|renameSync|unlinkSync)\b/)
  })
})

describe("gatherCompletionReviewInputs — Definition of Done stays separate", () => {
  test("DoD lines are NOT counted into `completed`", () => {
    //#given a numbered plan whose two DoD boxes are checked
    const plan = numberedPlan({ checked: 1, total: 3 })
    const zero = makeTempRoot("dod")
    writeFile(zero, `.matrixx/plans/dod-plan.md`, plan)

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: zero }))

    //#then only the one numbered task counts, and the DoD lines are surfaced separately
    expect(plan).toContain("- [x] acceptance criterion 1")
    expect(gathered.progress.completed).toBe(1)
    expect(gathered.progress.total).toBe(3)
    expect(gathered.progress.isComplete).toBe(false)
    expect(gathered.dod.length).toBe(2)

    removeTempRoot(zero)
  })

  test("a zero-checkbox plan surfaces needsTriage: true alongside isComplete: true", () => {
    //#given a prose-only plan with no checkboxes
    const vacuous = makeTempRoot("vacuous")
    writeFile(vacuous, ".matrixx/plans/vacuous-plan.md", zeroCheckboxPlan())

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: vacuous }))

    //#then the dangerous false-positive is passed through intact
    expect(gathered.progress.total).toBe(0)
    expect(gathered.progress.isComplete).toBe(true)
    expect(gathered.progress.needsTriage).toBe(true)

    removeTempRoot(vacuous)
  })
})

describe("gatherReviewablePlans — _archive is never reviewable", () => {
  test("returns no path inside the _archive directory", () => {
    //#given a live plan and an archived one
    const archiveRoot = makeTempRoot("archive")
    writeFile(archiveRoot, ".matrixx/plans/live-plan.md", numberedPlan())
    writeFile(archiveRoot, ".matrixx/plans/_archive/stale-plan.md", numberedPlan({ checked: 3, total: 3 }))

    //#when plans are listed
    const plans = gatherReviewablePlans(archiveRoot)

    //#then only the live one is returned
    expect(plans.some((p) => p.includes("_archive"))).toBe(false)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toContain("live-plan.md")

    removeTempRoot(archiveRoot)
  })
})

describe("gatherCompletionReviewInputs — attribution completeness", () => {
  test("linked terminal count of 0 degrades every attribution-dependent dimension", () => {
    //#given a plan with no linked tasks at all
    const noLink = makeTempRoot("nolink")
    writeFile(noLink, ".matrixx/plans/lonely-plan.md", numberedPlan({ checked: 3, total: 3 }))

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: noLink }))

    //#then ratio is 0 and every dependent dimension is unscorable
    expect(gathered.attribution.linkedTerminal).toBe(0)
    expect(gathered.attribution.ratio).toBe(0)
    expect(gathered.attribution.matches).toBe(false)
    expect(gathered.degradation.unscorableDimensions).toEqual([...ATTRIBUTION_DEPENDENT_DIMENSIONS])

    removeTempRoot(noLink)
  })

  test("a partial link degrades dimensions 1 and 7 to unscorable rather than scoring them", () => {
    //#given a 3-task plan with only 1 of 3 tasks linked and terminal
    const partial = makeTempRoot("partial")
    writeFile(partial, ".matrixx/plans/partial-plan.md", numberedPlan({ checked: 3, total: 3 }))
    writeFile(
      partial,
      ".matrixx/tasks/T-22222222-2222-4222-8222-222222222222.json",
      JSON.stringify(
        runtimeTaskFile({
          id: "T-22222222-2222-4222-8222-222222222222",
          subject: "task number 1",
          status: "completed",
          planName: "partial-plan",
          projectRoot: partial,
        }),
      ),
    )

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: partial }))

    //#then attribution is incomplete and the dependent dimensions degrade
    expect(gathered.attribution.planTasks).toBe(3)
    expect(gathered.attribution.linkedTerminal).toBe(1)
    expect(gathered.attribution.matches).toBe(false)
    expect(gathered.degradation.unscorableDimensions).toEqual([1, 7])
    expect(gathered.degradation.reasons["1"]).toBe(ATTRIBUTION_REASON)
    expect(gathered.degradation.reasons["7"]).toBe(ATTRIBUTION_REASON)

    removeTempRoot(partial)
  })

  test("a full link leaves the dependent dimensions scorable", () => {
    //#given a 1-task plan with 1 linked terminal task
    const full = makeTempRoot("full")
    writeFile(full, ".matrixx/plans/solo-plan.md", numberedPlan({ checked: 1, total: 1 }))
    writeFile(
      full,
      ".matrixx/tasks/T-33333333-3333-4333-8333-333333333333.json",
      JSON.stringify(
        runtimeTaskFile({
          id: "T-33333333-3333-4333-8333-333333333333",
          subject: "task number 1",
          status: "completed",
          planName: "solo-plan",
          projectRoot: full,
        }),
      ),
    )

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: full }))

    //#then attribution matches and nothing is degraded
    expect(gathered.attribution.matches).toBe(true)
    expect(gathered.degradation.unscorableDimensions).toEqual([])

    removeTempRoot(full)
  })
})

describe("gatherCompletionReviewInputs — admission corroboration", () => {
  test("gathers linked terminal status and notepad Completion stamps as independent inputs", () => {
    //#given a 1-task plan, 1 linked completed task, and 1 stamped notepad
    const admitted = makeTempRoot("admitted")
    writeFile(admitted, ".matrixx/plans/ok-plan.md", numberedPlan({ checked: 1, total: 1 }))
    writeFile(
      admitted,
      ".matrixx/tasks/T-44444444-4444-4444-8444-444444444444.json",
      JSON.stringify(
        runtimeTaskFile({
          id: "T-44444444-4444-4444-8444-444444444444",
          subject: "task number 1",
          status: "completed",
          planName: "ok-plan",
          projectRoot: admitted,
        }),
      ),
    )
    writeFile(
      admitted,
      ".matrixx/notepads/ok-plan/T-44444444-4444-4444-8444-444444444444.md",
      notepadContent({ taskId: "T-44444444-4444-4444-8444-444444444444", stamped: true }),
    )

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: admitted }))

    //#then both corroboration inputs are present and independent of isComplete
    expect(gathered.admission.linkedTerminalTasks).toEqual([
      { id: "T-44444444-4444-4444-8444-444444444444", status: "completed", terminal: true },
    ])
    expect(gathered.admission.notepadCompletionStamps).toEqual(["T-44444444-4444-4444-8444-444444444444"])
    expect(gathered.admission.corroborationCount).toBe(2)
    // A vacuous plan is `isComplete: true`; corroboration is still empty — the
    // gate must be a conjunction, never a read off `isComplete`.
    const vacuous = makeTempRoot("admitted-vacuous")
    writeFile(vacuous, ".matrixx/plans/void-plan.md", zeroCheckboxPlan())
    const voidGathered = gatherCompletionReviewInputs(sources({ directory: vacuous }))
    expect(voidGathered.progress.isComplete).toBe(true)
    expect(voidGathered.admission.corroborationCount).toBe(0)

    removeTempRoot(admitted)
    removeTempRoot(vacuous)
  })
})

describe("gatherCompletionReviewInputs — deliverable drift", () => {
  test("records the start commit and the diff against it", () => {
    //#given a plan carrying plan-persister metadata with a start commit
    const drifted = makeTempRoot("drift")
    writeFile(
      drifted,
      ".matrixx/plans/drifted-plan.md",
      `${numberedPlan({ checked: 1, total: 1 })}\n<!-- plan-persister: {"id":"drifted-plan","updatedAt":"2026-01-01T00:00:00.000Z","sessionId":"s1","todoTotal":1,"todoCompleted":1,"gitHead":{"sha":"abc1234"}} -->\n`,
    )

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: drifted }))

    //#then the stat and name-status summaries are both captured
    expect(gathered.drift.startCommit).toBe("abc1234")
    expect(gathered.drift.nameStatus).toEqual([
      { status: "M", path: "src/a.ts" },
      { status: "A", path: "src/b.ts" },
    ])
    expect(gathered.drift.stat).toContain("1 file changed")

    removeTempRoot(drifted)
  })

  test("a plan with no recorded start commit is unscorable for drift", () => {
    //#given a plan with no plan-persister metadata
    const noCommit = makeTempRoot("nocommit")
    writeFile(noCommit, ".matrixx/plans/bare-plan.md", numberedPlan({ checked: 1, total: 1 }))

    //#when the gatherer runs
    const gathered = gatherCompletionReviewInputs(sources({ directory: noCommit }))

    //#then drift is explicitly unscorable, not silently empty
    expect(gathered.drift.startCommit).toBeNull()
    expect(gathered.drift.unscorable).toBe(true)
    expect(gathered.drift.unscorableReason).toBe("plan records no start commit")

    removeTempRoot(noCommit)
  })
})

describe("no hook, idle, or event-handler caller", () => {
  test("no hook directory or plugin handler references the gatherer", () => {
    //#given the hook, continuation, skill, and plugin-interface trees
    const trees = [
      join(REPO_ROOT, "src/hooks"),
      join(REPO_ROOT, "src/plugin"),
      join(REPO_ROOT, "src/plugin-handlers"),
      join(REPO_ROOT, "src/plugin-interface.ts"),
      join(REPO_ROOT, "src/create-hooks.ts"),
    ]

    //#when each tree is scanned for the gatherer's public entry point
    const offenders: string[] = []
    for (const tree of trees) {
      offenders.push(...scanForCallers(tree, "gatherCompletionReviewInputs"))
    }

    //#then there are none
    expect(offenders).toEqual([])
  })
})

function scanForCallers(target: string, symbol: string): string[] {
  const { readdirSync: rd, statSync: st, readFileSync: rf } = require("node:fs") as typeof import("node:fs")
  const found: string[] = []
  let entries: string[]
  try {
    entries = rd(target) as string[]
  } catch {
    return found
  }
  for (const entry of entries) {
    const absolute = join(target, entry)
    if (st(absolute).isDirectory()) {
      found.push(...scanForCallers(absolute, symbol))
      continue
    }
    if (!entry.endsWith(".ts")) continue
    const text = rf(absolute, "utf-8") as string
    // Ignore the definition site itself and any test file.
    if (text.includes(symbol) && !text.includes("export function " + symbol) && !entry.includes(".test.")) {
      found.push(absolute.replace(`${REPO_ROOT}/`, ""))
    }
  }
  return found
}
