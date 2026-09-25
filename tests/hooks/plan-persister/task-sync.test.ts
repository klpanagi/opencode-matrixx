/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeMissionState } from "../../../src/features/mission-state/storage"
import type { MissionState } from "../../../src/features/mission-state/types"
import type { TaskObject } from "../../../src/tools/task/types"
import { collectLinkedTodos, isTaskLinkedToMission, isTerminalTaskStatus } from "../../../src/hooks/plan-persister/task-link"
import { applyFilteredSync, maybeSyncTaskToPlans } from "../../../src/hooks/plan-persister/task-sync"

const SESSION = "ses-linked-1"
const FOREIGN = "ses-foreign-9"
const NUMBERED_BODY = "# Scratch\n\n- [ ] 1. Implement login flow\n- [ ] 2. Add logout button\n"
function setupScratch(sessionIds: string[] = [SESSION], body: string = NUMBERED_BODY) {
  const dir = mkdtempSync(join(tmpdir(), "plan-sync-"))
  const planDir = join(dir, ".matrixx", "plans")
  mkdirSync(planDir, { recursive: true })
  const planPath = join(planDir, "scratch.md")
  writeFileSync(planPath, body, "utf-8")
  const mission: MissionState = { active_plan: planPath, started_at: new Date().toISOString(), session_ids: sessionIds, plan_name: "scratch" }
  writeMissionState(dir, mission)
  return { dir, planPath, mission }
}
let taskSeq = 0
function makeTask(dir: string, overrides: Partial<TaskObject> = {}): TaskObject {
  taskSeq += 1
  return {
    id: `T-task-${taskSeq}`,
    subject: "Implement login flow",
    description: "d",
    status: "completed",
    blocks: [],
    blockedBy: [],
    threadID: SESSION,
    projectRoot: dir,
    ...overrides,
  }
}
function writeTaskFile(dir: string, task: TaskObject): void {
  const taskDir = join(dir, ".matrixx", "tasks")
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(join(taskDir, `${task.id}.json`), JSON.stringify(task), "utf-8")
}
describe("linked convergence", () => {
  test("linked convergence: completing a linked task flips its numbered box", async () => {
    //#given a scratch plan and a completed task linked via threadID
    const { dir, planPath } = setupScratch()
    const task = makeTask(dir)
    //#when the sync trigger runs
    const result = await maybeSyncTaskToPlans({ directory: dir, task, config: {} })
    //#then the numbered box flips, siblings keep state, progress increments
    expect(result.ok).toBe(true)
    expect(result.total).toBe(2)
    expect(result.completed).toBe(1)
    expect(result.matched?.shared).toBeGreaterThanOrEqual(2)
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] 1. Implement login flow")
    expect(content).toContain("- [ ] 2. Add logout button")
  })
  test("linked convergence: deleted status also flips the box", async () => {
    //#given a linked task deleted instead of completed
    const { dir, planPath } = setupScratch()
    const task = makeTask(dir, { status: "deleted", subject: "Add logout button" })
    //#when the sync trigger runs
    const result = await maybeSyncTaskToPlans({ directory: dir, task, config: {} })
    //#then the matching box flips
    expect(result.ok).toBe(true)
    expect(readFileSync(planPath, "utf-8")).toContain("- [x] 2. Add logout button")
  })
  test("linked convergence: metadata.planName links a foreign-thread task", async () => {
    //#given a task from an unknown session carrying the plan name
    const { dir, planPath } = setupScratch()
    const task = makeTask(dir, { threadID: FOREIGN, metadata: { planName: "scratch" } })
    //#when the sync trigger runs
    const result = await maybeSyncTaskToPlans({ directory: dir, task, config: {} })
    //#then the box flips via the planName signal
    expect(result.ok).toBe(true)
    expect(readFileSync(planPath, "utf-8")).toContain("- [x] 1. Implement login flow")
  })
})
describe("negatives (foreign / drifted)", () => {
  test("negative foreign: unlinked task leaves the plan untouched", async () => {
    //#given a completed task from a foreign session with no plan signal
    const { dir, planPath } = setupScratch()
    const task = makeTask(dir, { threadID: FOREIGN })
    //#when the sync trigger runs
    const result = await maybeSyncTaskToPlans({ directory: dir, task, config: {} })
    //#then sync is skipped and the box stays unchecked
    expect(result.ok).toBe(false)
    expect(result.linked).toBe(false)
    expect(result.skippedReason).toContain("task-unlinked")
    expect(readFileSync(planPath, "utf-8")).toContain("- [ ] 1. Implement login flow")
  })
  test("negative foreign: projectRoot mismatch never links", async () => {
    //#given a task whose session matches but whose project does not
    const { dir } = setupScratch()
    const task = makeTask("/elsewhere")
    //#when linkage is decided
    const decision = isTaskLinkedToMission(task, setupScratch().mission, {
      directory: dir,
      sessionScoped: false,
    })
    //#then the project gate rejects it even unscoped
    expect(decision.linked).toBe(false)
    expect(decision.reason).toBe("project-mismatch")
  })
  test("negative drifted: strict-null file counts as unknown, never a vote", () => {
    //#given one drifted file plus one valid linked completed task on disk
    const { dir, mission } = setupScratch()
    writeTaskFile(dir, makeTask(dir))
    const taskDir = join(dir, ".matrixx", "tasks")
    writeFileSync(join(taskDir, "T-drifted.json"), "{not valid task json", "utf-8")
    //#when the filtered scan runs
    const { todos, unknown } = collectLinkedTodos(dir, mission, {})
    //#then the drifted file is unknown and only the valid task votes
    expect(unknown).toBe(1)
    expect(todos).toHaveLength(1)
  })
  test("negative non-terminal: pending task performs no write", async () => {
    //#given an untouched plan and a pending linked task
    const { dir, planPath } = setupScratch()
    const before = readFileSync(planPath, "utf-8")
    const task = makeTask(dir, { status: "pending" })
    //#when the sync trigger runs
    const result = await maybeSyncTaskToPlans({ directory: dir, task, config: {} })
    //#then nothing happens — byte-identical file, no metadata appended
    expect(result.ok).toBe(false)
    expect(result.skippedReason).toBe("non-terminal-status")
    expect(readFileSync(planPath, "utf-8")).toBe(before)
  })
})
describe("capture pipeline (filtered scan + numbered recount)", () => {
  test("capture pipeline: union scan syncs only linked tasks", async () => {
    //#given linked + foreign completed tasks on disk
    const { dir, planPath, mission } = setupScratch()
    writeTaskFile(dir, makeTask(dir))
    writeTaskFile(dir, makeTask(dir, { id: "T-foreign-1", threadID: FOREIGN, subject: "Add logout button" }))
    //#when the filtered scan feeds the shared pipeline
    const { todos, unknown } = collectLinkedTodos(dir, mission, {})
    const result = await applyFilteredSync({
      directory: dir,
      mission,
      planPath,
      todos,
      actorSessionId: SESSION,
    })
    //#then only the linked box flips
    expect(unknown).toBe(0)
    expect(todos).toHaveLength(1)
    expect(result.ok).toBe(true)
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] 1. Implement login flow")
    expect(content).toContain("- [ ] 2. Add logout button")
  })
  test("capture pipeline: recount prefers numbered boxes over DoD", async () => {
    //#given a plan mixing numbered tasks with unnumbered DoD boxes
    const body = "# S\n\n- [ ] 1. Implement login flow\n- [ ] Definition of done review\n"
    const { dir, planPath, mission } = setupScratch([SESSION], body)
    writeTaskFile(dir, makeTask(dir))
    //#when the shared pipeline recounts
    const { todos } = collectLinkedTodos(dir, mission, {})
    const result = await applyFilteredSync({
      directory: dir,
      mission,
      planPath,
      todos,
      actorSessionId: SESSION,
    })
    //#then only the numbered box counts toward progress
    expect(result.ok).toBe(true)
    expect(result.total).toBe(1)
    expect(result.completed).toBe(1)
  })
})
describe("task-link decisions", () => {
  test("linkage: signal-less task links only when session_scoped=false", () => {
    //#given a pre-migration task with no threadID or parentID
    const { dir, mission } = setupScratch()
    const bare = { ...makeTask(dir), threadID: undefined } as unknown as TaskObject
    //#when linkage is decided under both scoping modes
    const scoped = isTaskLinkedToMission(bare, mission, { directory: dir, sessionScoped: true })
    const unscoped = isTaskLinkedToMission(bare, mission, { directory: dir, sessionScoped: false })
    //#then scoped rejects (no vote) while legacy unscoped admits
    expect(scoped.linked).toBe(false)
    expect(scoped.reason).toBe("no-linkage-signal")
    expect(unscoped.linked).toBe(true)
  })
  test("terminal statuses: completed/cancelled/deleted vote, pending does not", () => {
    //#given the status vocabulary
    //#when classified
    //#then only terminal statuses drive sync
    expect(isTerminalTaskStatus("completed")).toBe(true)
    expect(isTerminalTaskStatus("cancelled")).toBe(true)
    expect(isTerminalTaskStatus("deleted")).toBe(true)
    expect(isTerminalTaskStatus("pending")).toBe(false)
    expect(isTerminalTaskStatus("in_progress")).toBe(false)
  })
})
