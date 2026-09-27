/**
 * Tests for plan-persister hook.
 *
 * Plan sync is mission-linked only: the hook reads task files under
 * `.matrixx/tasks/` and never falls back to OpenCode's raw todo list.
 */
import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"

import { createPlanPersister } from "../../../src/hooks/plan-persister/hook"

const LOG_FILE = join(tmpdir(), "matrixx.log")

function tmpDir(): string {
  const d = join(tmpdir(), `plan-persister-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function createMockContext(): PluginInput {
  const client = createOpencodeClient({ directory: "/tmp/test" })
  return {
    client,
    project: { id: "test-project", worktree: "/tmp/test", time: { created: Date.now() } },
    directory: "/tmp/test",
    worktree: "/tmp/test",
    serverUrl: new URL("http://localhost"),
    $: Bun.$,
  }
}

/**
 * Build a context whose `session.todo` always throws and counts invocations.
 * The spy exists purely to prove the hook never reaches the legacy read.
 */
function createThrowingTodoContext(): { ctx: PluginInput; invocations: () => number } {
  const client = createOpencodeClient({ directory: "/tmp/test" })
  type SessionTodoOptions = Parameters<typeof client.session.todo>[0]
  type SessionTodoResult = ReturnType<typeof client.session.todo>
  let calls = 0
  client.session.todo = async (_: SessionTodoOptions): Promise<SessionTodoResult> => {
    calls += 1
    throw new Error("session.todo must never be called")
  }
  const ctx: PluginInput = {
    client,
    project: { id: "test-project", worktree: "/tmp/test", time: { created: Date.now() } },
    directory: "/tmp/test",
    worktree: "/tmp/test",
    serverUrl: new URL("http://localhost"),
    $: Bun.$,
  }
  return { ctx, invocations: () => calls }
}

function setupFixture(dir: string, planName: string, planContent: string): string {
  const missionDir = join(dir, ".matrixx")
  mkdirSync(missionDir, { recursive: true })
  const plansDir = join(dir, ".matrixx", "plans")
  mkdirSync(plansDir, { recursive: true })
  const planPath = join(plansDir, `${planName}.md`)
  writeFileSync(planPath, planContent, "utf-8")

  writeFileSync(
    join(missionDir, "mission.json"),
    JSON.stringify({
      active_plan: planPath,
      started_at: "2026-07-10T20:00:00.000Z",
      session_ids: ["test-session-1", "test-session-2"],
      plan_name: planName,
    }),
    "utf-8",
  )
  return planPath
}

let taskCounter = 0

/** Write a task file linked to the mission through `metadata.planName`. */
function writeLinkedTask(
  dir: string,
  planName: string,
  subject: string,
  status: "pending" | "in_progress" | "completed",
): void {
  const tasksDir = join(dir, ".matrixx", "tasks")
  mkdirSync(tasksDir, { recursive: true })
  taskCounter += 1
  writeFileSync(
    join(tasksDir, `T-task-${taskCounter}.json`),
    JSON.stringify({
      id: `T-task-${taskCounter}`,
      subject,
      description: subject,
      status,
      blocks: [],
      blockedBy: [],
      threadID: "test-session-1",
      projectRoot: dir,
      metadata: { planName },
    }),
    "utf-8",
  )
}

function logSize(): number {
  return existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0
}

/** Read the log bytes appended after `offset`. Uses a byte-positioned read so
 *  a multi-byte character earlier in the file cannot shift the offset. */
function logSince(offset: number): string {
  if (!existsSync(LOG_FILE)) return ""
  const size = statSync(LOG_FILE).size
  if (size <= offset) return ""
  const fd = openSync(LOG_FILE, "r")
  try {
    const buffer = Buffer.alloc(size - offset)
    readSync(fd, buffer, 0, buffer.length, offset)
    return buffer.toString("utf-8")
  } finally {
    closeSync(fd)
  }
}

async function waitForPendingTicks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("plan-persister", () => {
  it("returns handlers when created", () => {
    const dir = tmpDir()
    const hook = createPlanPersister(createMockContext(), { directory: dir })

    expect(hook).toBeDefined()
    expect(typeof hook.capture).toBe("function")
    expect(typeof hook.event).toBe("function")
    expect(typeof hook.buildRehydrationContext).toBe("function")
  })

  it("ignores session.idle for non-mission sessions", async () => {
    const dir = tmpDir()
    const hook = createPlanPersister(createMockContext(), { directory: dir })

    // No mission.json — no active plan
    await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses_1" } } })
  })

  it("writes plan file on session.idle for a mission-linked task", async () => {
    //#given
    const dir = tmpDir()
    const planPath = setupFixture(dir, "test-plan", "- [ ] Task one\n- [ ] Task two")
    writeLinkedTask(dir, "test-plan", "Task one", "completed")
    writeLinkedTask(dir, "test-plan", "Task two", "pending")

    const hook = createPlanPersister(createMockContext(), { directory: dir })

    //#when
    await hook.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-1" },
      },
    })
    await waitForPendingTicks()

    //#then
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] Task one")
    expect(content).toContain("- [ ] Task two")
    expect(content).toContain("<!-- plan-persister:")
  })

  it("handles session.compacted by capturing linked task state", async () => {
    //#given
    const dir = tmpDir()
    const planPath = setupFixture(dir, "compact-test", "- [ ] Item A\n- [ ] Item B")
    writeLinkedTask(dir, "compact-test", "Item A", "completed")
    writeLinkedTask(dir, "compact-test", "Item B", "pending")

    const hook = createPlanPersister(createMockContext(), { directory: dir })

    //#when
    await hook.event({
      event: {
        type: "session.compacted",
        properties: { sessionID: "test-session-2" },
      },
    })
    await waitForPendingTicks()

    //#then
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] Item A")
    expect(content).toContain("- [ ] Item B")
  })

  it("does nothing on session.error or session.deleted", async () => {
    const dir = tmpDir()
    setupFixture(dir, "ignore-test", "- [ ] Task")

    const hook = createPlanPersister(createMockContext(), { directory: dir })

    // Should not throw on ignored events
    await hook.event({ event: { type: "session.error", properties: { sessionID: "ses_1" } } })
    await hook.event({ event: { type: "session.deleted", properties: { sessionID: "ses_1" } } })
  })

  it("never calls ctx.client.session.todo and leaves the plan byte-identical", async () => {
    //#given
    const dir = tmpDir()
    const planPath = setupFixture(dir, "no-fallback", "- [ ] Task\n")
    const before = readFileSync(planPath, "utf-8")
    const { ctx, invocations } = createThrowingTodoContext()
    const hook = createPlanPersister(ctx, { directory: dir })

    //#when
    await hook.capture("test-session-1")
    await waitForPendingTicks()

    //#then
    expect(invocations()).toBe(0)
    expect(readFileSync(planPath, "utf-8")).toBe(before)
  })

  it("logs the zero-linked-todos condition naming the session", async () => {
    //#given
    const dir = tmpDir()
    setupFixture(dir, "diagnosable", "- [ ] Task")
    const offset = logSize()
    const hook = createPlanPersister(createMockContext(), { directory: dir })

    //#when
    await hook.capture("test-session-1")
    await waitForPendingTicks()

    //#then
    const tail = logSince(offset)
    expect(tail).toContain("no mission-linked tasks")
    expect(tail).toContain("test-session-1")
  })

  it("buildRehydrationContext returns directive string when mission is active", () => {
    const dir = tmpDir()
    setupFixture(dir, "rehydrate-test", "- [ ] Task one\n- [x] Task two")

    const hook = createPlanPersister(createMockContext(), { directory: dir })

    const directive = hook.buildRehydrationContext("ses_1")
    expect(directive).toBeTruthy()
    expect(directive!).toContain("Active Plan: rehydrate-test")
    expect(directive!).toContain("1/2 tasks completed")
  })

  it("buildRehydrationContext returns null when no active mission", () => {
    const dir = tmpDir()
    const hook = createPlanPersister(createMockContext(), { directory: dir })

    expect(hook.buildRehydrationContext("ses_1")).toBeNull()
  })
})
