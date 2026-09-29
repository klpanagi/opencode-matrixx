/// <reference types="bun-types" />

/**
 * Task 26 — the Plan B (`plan-completion-review.md`) HANDOFF GATE.
 *
 * Plan B is blocked on Plan A's section-addressing cutover: 4 of its 8 rubric
 * dimensions read plan SECTIONS. This suite turns that dependency from a claim
 * into an executable precondition. Nothing here implements any part of Plan B
 * — it only proves every data source Plan B's rubric needs is reachable, and
 * proves the ONE distinction a Plan B author will otherwise get wrong:
 *
 *   - `tasks: []` on a NON-degraded manifest  = a real zero-checkbox plan
 *     (score it, but `isComplete` is vacuous).
 *   - `tasks` ABSENT on a DEGRADED manifest   = the plan was not read
 *     (do not score; do not treat as complete).
 *
 * Both arms are asserted with distinct fixtures (see `describe("condition 7")`).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { existsSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildSectionIndex } from "../../../src/tools/plan/section-index"
import {
  buildSectionedPlan,
  indexOf,
  makePlanDir,
  removePlanDir,
  testContext,
  writePlan,
} from "./plan-read-section-fixtures"
import { resolveSectionSelector } from "../../../src/features/plan-contract/section-registry"
import { countPlanProgressFromContent } from "../../../src/features/mission-state/storage"
import { MAX_PLAN_FILE_BYTES } from "../../../src/tools/plan/constants"
import { createPlanReadTool } from "../../../src/tools/plan/plan-read"
import { createPlanTasksTool } from "../../../src/tools/plan/plan-tasks"

const TEST_ABORT = new AbortController()

function tasksContext(testDir: string): ToolContext {
  return {
    sessionID: "test-session-plan-b-handoff",
    messageID: "test-message-plan-b-handoff",
    agent: "test-agent",
    abort: TEST_ABORT.signal,
    directory: testDir,
  } as unknown as ToolContext
}

interface Manifest {
  filePath: string
  degraded?: { reason: string; size: number; cap: number; message: string }
  progress?: {
    total: number
    completed: number
    remaining: number
    isComplete: boolean
    needsTriage?: boolean
  }
  tasks?: Array<{ n: number; title: string; checked: boolean; line: number; anchor: string }>
  dod?: string[]
  tasksTruncated?: { shown: number; total: number }
  hint?: string
  error?: string
}

/**
 * The consumer contract a Plan B reviewer must implement. `degraded` is
 * consulted FIRST, before `tasks.length` — that ordering is the whole point of
 * condition 7, so it is modelled here as a function and asserted both ways.
 *
 * - `unreadable` — degraded AND no `tasks` key: the plan could not be read.
 *   Scoring it would invent a perfect score for an unread document.
 * - `score`     — a readable plan, including a genuine zero-checkbox plan.
 *   `vacuous` flags `progress.isComplete` being true only because total === 0.
 */
function interpretManifest(manifest: Manifest): {
  verdict: "unreadable" | "score"
  vacuous: boolean
} {
  // FIRST: is this plan readable at all? Never inferred from task count.
  if (manifest.degraded && !("tasks" in manifest)) {
    return { verdict: "unreadable", vacuous: false }
  }
  const tasks = manifest.tasks ?? []
  const vacuous = tasks.length === 0 && manifest.progress?.isComplete === true
  return { verdict: "score", vacuous }
}

/** A real plan with ZERO checkboxes — readable, and genuinely empty. */
const ZERO_CHECKBOX_PLAN = [
  "# Zero Checkbox Plan",
  "",
  "## TL;DR",
  "A plan that carries prose but no task checkboxes at all.",
  "",
  "## Context",
  "Prose body.",
  "",
  "## TODOs",
  "No checkboxes appear in this section.",
  "",
].join("\n")

/** An over-cap plan carrying real numbered tasks, padded past the cap. */
function buildOverCapPlan(offset: number): string {
  const lines = ["# Over Cap Handoff Plan", "", "## TODOs", ""]
  for (let i = 1; i <= 4; i++) lines.push(`- [ ] ${i}. Task number ${i} with a realistic length title`)
  const body = `${lines.join("\n")}\n`
  const target = MAX_PLAN_FILE_BYTES + offset
  const filler = target - Buffer.byteLength(body, "utf8")
  if (filler < 0) throw new Error("body is over the requested size")
  return body + "a".repeat(filler)
}

describe("Plan B handoff precondition (Task 26)", () => {
  let testDir: string

  beforeEach(() => {
    testDir = makePlanDir()
  })

  afterEach(() => {
    removePlanDir(testDir)
  })

  describe("condition 1 — plan_read returns a section's span", () => {
    test("a section selector yields exactly that section's span", async () => {
      //#given a plan with five sections
      const content = buildSectionedPlan()
      writePlan(testDir, "handoff-span.md", content)
      const entry = indexOf(content, "execution-strategy")

      //#when read with a section selector
      const res = JSON.parse(
        await createPlanReadTool().execute(
          { filePath: ".matrixx/plans/handoff-span.md", section: "execution-strategy", format: "content" },
          testContext(testDir),
        ),
      )

      //#then the payload is that section's span and nothing else
      expect(res.section.id).toBe("execution-strategy")
      expect(res.section.startLine).toBe(entry.startLine)
      expect(res.section.endLine).toBe(entry.endLine)
      expect(res.content.split("\n").length).toBe(entry.endLine - entry.startLine)
      expect(res.content).toContain("## Execution Strategy")
      expect(res.content).not.toContain("Tldr marker line")
    })

    test("startLine is 1-based inclusive and endLine is exclusive, so an H3 nests in its H2", async () => {
      //#given the indexed spans of a plan whose H3 sits inside an H2
      const content = buildSectionedPlan()

      //#when the index is built
      const entries = buildSectionIndex(content)

      //#then the H2 span strictly contains the H3 span — 1-based inclusive / exclusive
      const h2 = entries.find((e) => e.id === "execution-strategy")
      const h3 = entries.find((e) => e.id === "agent-executed-qa-scenarios")
      expect(h2).toBeDefined()
      expect(h3).toBeDefined()
      expect(h3?.startLine).toBeGreaterThan(h2?.startLine as number)
      expect(h3?.endLine).toBeLessThanOrEqual(h2?.endLine as number)
      //#then therefore section `bytes` overlap: only level === 2 bytes are summable
      const h2Bytes = entries.filter((e) => e.level === 2).reduce((sum, e) => sum + e.bytes, 0)
      const allBytes = entries.reduce((sum, e) => sum + e.bytes, 0)
      expect(allBytes).toBeGreaterThan(h2Bytes)
    })
  })

  describe("condition 2 — plan_tasks returns a dod array", () => {
    test("the manifest carries dod as a string array", async () => {
      //#given a plan with a Definition of Done of two items
      const content = [
        "# DoD Plan",
        "",
        "## TODOs",
        "",
        "- [ ] 1. first task",
        "",
        "## Definition of Done",
        "",
        "- [ ] All tasks complete",
        "- [x] Suite is green",
        "",
      ].join("\n")
      writePlan(testDir, "handoff-dod.md", content)

      //#when the manifest is requested
      const manifest = JSON.parse(
        await createPlanTasksTool().execute(
          { filePath: ".matrixx/plans/handoff-dod.md" },
          tasksContext(testDir),
        ),
      ) as Manifest

      //#then dod is a string array — Plan B's DoD-coverage dimension has a source
      expect(Array.isArray(manifest.dod)).toBe(true)
      expect(manifest.dod).toEqual(["All tasks complete", "Suite is green"])
    })
  })

  describe("conditions 3-5 — the three Plan B H3s resolve in the registry", () => {
    const H3S = [
      { heading: "Must NOT Have (Guardrails)", planBDimension: "guardrail adherence (2)" },
      { heading: "Concrete Deliverables", planBDimension: "deliverable drift (5)" },
      { heading: "Test Decision", planBDimension: "verifiability / test-decision honored (7)" },
    ] as const

    for (const { heading, planBDimension } of H3S) {
      test(`"${heading}" resolves (not custom, not ambiguous) — ${planBDimension}`, () => {
        //#given the raw corpus heading text
        const selector = `### ${heading}`

        //#when it is resolved against the H2+H3 registry
        const resolution = resolveSectionSelector(selector)

        //#then it is a REGISTRY hit with a kebab id, so plan_read can address it
        expect(resolution.kind).toBe("resolved")
        if (resolution.kind !== "resolved") throw new Error("unreachable: kind asserted above")
        expect(resolution.entry.id).toBe(heading.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, "-"))
        expect(resolution.entry.level).toBe(3)
      })
    }
  })

  describe("condition 6 — countPlanProgressFromContent is authoritative", () => {
    test("a zero-checkbox plan reports needsTriage, and isComplete is vacuous", () => {
      //#given a plan body with zero checkboxes
      const content = ZERO_CHECKBOX_PLAN

      //#when the shared progress counter runs
      const progress = countPlanProgressFromContent(content)

      //#then total === 0 makes needsTriage true — "cannot be scored", not "perfect"
      expect(progress.total).toBe(0)
      expect(progress.needsTriage).toBe(true)
      //#then isComplete is TRUE for the same reason — vacuously complete
      expect(progress.isComplete).toBe(true)
    })
  })

  describe("condition 7 — a consumer branches on degraded BEFORE tasks.length", () => {
    test("ARM A: tasks: [] on a NON-degraded manifest is a real zero-checkbox plan", async () => {
      //#given a readable under-cap plan that carries no checkboxes
      writePlan(testDir, "zero-checkbox.md", ZERO_CHECKBOX_PLAN)

      //#when the manifest is read
      const manifest = JSON.parse(
        await createPlanTasksTool().execute(
          { filePath: ".matrixx/plans/zero-checkbox.md" },
          tasksContext(testDir),
        ),
      ) as Manifest

      //#then it is NOT degraded and `tasks` is PRESENT but empty
      expect(manifest.degraded).toBeUndefined()
      expect("tasks" in manifest).toBe(true)
      expect(manifest.tasks).toEqual([])
      //#then a consumer scores it — and is told the completeness is vacuous
      const reading = interpretManifest(manifest)
      expect(reading.verdict).toBe("score")
      expect(reading.vacuous).toBe(true)
      expect(manifest.progress?.needsTriage).toBe(true)
    })

    test("ARM B: an ABSENT tasks key on a DEGRADED manifest means unreadable", async () => {
      //#given a real over-cap plan, whose manifest is degraded
      writePlan(testDir, "over-cap-handoff.md", buildOverCapPlan(1))
      const overCap = JSON.parse(
        await createPlanTasksTool().execute(
          { filePath: ".matrixx/plans/over-cap-handoff.md" },
          tasksContext(testDir),
        ),
      ) as Manifest

      //#then the degrade marker is present, carrying the reason and the cap
      expect(overCap.degraded?.reason).toBe("file_over_cap")
      expect(overCap.degraded?.cap).toBe(MAX_PLAN_FILE_BYTES)
      //#given a degraded manifest whose task list could not be produced at all
      const unreadable: Manifest = { filePath: overCap.filePath, degraded: overCap.degraded }

      //#when a consumer branches the correct way
      const reading = interpretManifest(unreadable)

      //#then it is UNREADABLE — not scored, and never complete
      expect(reading.verdict).toBe("unreadable")
      //#then a consumer branching on task count FIRST reaches the opposite verdict
      const naiveWouldScoreItComplete = (unreadable.tasks ?? []).length === 0
      expect(naiveWouldScoreItComplete).toBe(true)
      expect(reading.verdict).not.toBe("score")
    })

    test("both arms disagree on the same apparent task count — the distinction is load-bearing", () => {
      //#given two manifests that both LOOK like "no tasks"
      const realZeroCheckbox: Manifest = {
        filePath: "real.md",
        tasks: [],
        progress: { total: 0, completed: 0, remaining: 0, isComplete: true, needsTriage: true },
      }
      const unreadable: Manifest = {
        filePath: "broken.md",
        degraded: {
          reason: "file_over_cap",
          size: MAX_PLAN_FILE_BYTES + 1,
          cap: MAX_PLAN_FILE_BYTES,
          message: "degraded",
        },
      }

      //#when each is interpreted
      const a = interpretManifest(realZeroCheckbox)
      const b = interpretManifest(unreadable)

      //#then the verdicts are opposite — conflating them either skips a real plan
      //#then or invents a perfect score for a plan that was never read
      expect(a.verdict).toBe("score")
      expect(b.verdict).toBe("unreadable")
      expect(a.verdict).not.toBe(b.verdict)
      //#then the only real zero-checkbox plan is the vacuous one
      expect(a.vacuous).toBe(true)
      expect(b.vacuous).toBe(false)
    })
  })
})

describe("Plan B handoff gate — filesystem hygiene", () => {
  test("the plan directory used by this suite is removed on teardown", () => {
    //#given a plan dir created by this suite's fixtures
    const dir = makePlanDir()

    //#when it is torn down through the shared fixture helper
    removePlanDir(dir)

    //#then nothing is left behind
    expect(existsSync(dir)).toBe(false)
    expect(existsSync(join(tmpdir(), "plan-read-section-never-created"))).toBe(false)
  })

  test("the plan dir helper is rooted in tmpdir(), not a hardcoded path", () => {
    //#given the shared fixture helper
    const dir = makePlanDir()

    //#when its location is inspected
    const resolved = realpathSync(dir)

    //#then it is under the OS temp root, so $TMPDIR is honoured
    expect(resolved.startsWith(realpathSync(tmpdir()))).toBe(true)
    removePlanDir(dir)
  })
})
