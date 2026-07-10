/**
 * Tests for plan-persister hook.
 */
import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"

import { createPlanPersister } from "./hook"

function tmpDir(): string {
  const d = join(tmpdir(), `plan-persister-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function createMockContext(todoResponses: Array<Array<{ content: string; status: string }>>): PluginInput {
  let callIndex = 0
  const client = createOpencodeClient({ directory: "/tmp/test" })
  type SessionTodoOptions = Parameters<typeof client.session.todo>[0]
  type SessionTodoResult = ReturnType<typeof client.session.todo>

  const request = new Request("http://localhost")
  const response = new Response()
  client.session.todo = async (_: SessionTodoOptions): Promise<SessionTodoResult> => {
    const current = todoResponses[Math.min(callIndex, todoResponses.length - 1)] ?? []
    callIndex += 1
    return { data: current, error: undefined, request, response }
  }

  return {
    client,
    project: { id: "test-project", worktree: "/tmp/test", time: { created: Date.now() } },
    directory: "/tmp/test",
    worktree: "/tmp/test",
    serverUrl: new URL("http://localhost"),
    $: Bun.$,
  }
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

async function waitForPendingTicks(): Promise<void> {
  // Allow microtasks (promises, etc.) to settle
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("plan-persister", () => {
  it("returns handlers when created", () => {
    const dir = tmpDir()
    const ctx = createMockContext([[]])
    const hook = createPlanPersister(ctx, { directory: dir })

    expect(hook).toBeDefined()
    expect(typeof hook.capture).toBe("function")
    expect(typeof hook.event).toBe("function")
    expect(typeof hook.buildRehydrationContext).toBe("function")
  })

  it("ignores session.idle for non-mission sessions", async () => {
    const dir = tmpDir()
    // No mission.json — no active plan
    const ctx = createMockContext([[{ content: "Task", status: "pending" }]])
    const hook = createPlanPersister(ctx, { directory: dir })

    // Should not throw
    await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses_1" } } })
    // No error — hook gracefully returns
  })

  it("writes plan file on session.idle for mission session", async () => {
    const dir = tmpDir()
    const planPath = setupFixture(dir, "test-plan", "- [ ] Task one\n- [ ] Task two")

    const ctx = createMockContext([
      [{ content: "Task one", status: "completed" }],
    ])
    const hook = createPlanPersister(ctx, { directory: dir })

    await hook.event({
      event: {
        type: "session.idle",
        properties: { sessionID: "test-session-1" },
      },
    })

    // Allow async operations to settle
    await waitForPendingTicks()

    // Plan file should now have Task one as completed
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] Task one")
    expect(content).toContain("- [ ] Task two")
    // Metadata comment should be present
    expect(content).toContain("<!-- plan-persister:")
  })

  it("handles session.compacted by capturing state", async () => {
    const dir = tmpDir()
    const planPath = setupFixture(dir, "compact-test", "- [ ] Item A\n- [ ] Item B")

    const ctx = createMockContext([
      [{ content: "Item A", status: "completed" }],
    ])
    const hook = createPlanPersister(ctx, { directory: dir })

    await hook.event({
      event: {
        type: "session.compacted",
        properties: { sessionID: "test-session-2" },
      },
    })

    await waitForPendingTicks()

    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [x] Item A")
    expect(content).toContain("- [ ] Item B")
  })

  it("does nothing on session.error or session.deleted", async () => {
    const dir = tmpDir()
    setupFixture(dir, "ignore-test", "- [ ] Task")

    const ctx = createMockContext([[{ content: "Task", status: "completed" }]])
    const hook = createPlanPersister(ctx, { directory: dir })

    // Should not throw on ignored events
    await hook.event({ event: { type: "session.error", properties: { sessionID: "ses_1" } } })
    await hook.event({ event: { type: "session.deleted", properties: { sessionID: "ses_1" } } })

    // No crash = success
  })

  it("recovers gracefully if ctx.client.session.todo() throws", async () => {
    const dir = tmpDir()
    const planPath = setupFixture(dir, "crash-test", "- [ ] Task")

    const client = createOpencodeClient({ directory: "/tmp/test" })
    client.session.todo = async () => {
      throw new Error("API unavailable")
    }
    const ctx: PluginInput = {
      client,
      project: { id: "test-project", worktree: "/tmp/test", time: { created: Date.now() } },
      directory: "/tmp/test",
      worktree: "/tmp/test",
      serverUrl: new URL("http://localhost"),
      $: Bun.$,
    }
    const hook = createPlanPersister(ctx, { directory: dir })

    // Should not throw despite API error
    await hook.capture("test-session-1")

    // Plan file should remain unchanged
    const content = readFileSync(planPath, "utf-8")
    expect(content).toContain("- [ ] Task")
  })

  it("buildRehydrationContext returns directive string when mission is active", () => {
    const dir = tmpDir()
    setupFixture(dir, "rehydrate-test", "- [ ] Task one\n- [x] Task two")

    const ctx = createMockContext([[]])
    const hook = createPlanPersister(ctx, { directory: dir })

    const directive = hook.buildRehydrationContext("ses_1")
    expect(directive).toBeTruthy()
    expect(directive!).toContain("Active Plan: rehydrate-test")
    expect(directive!).toContain("1/2 tasks completed")
  })

  it("buildRehydrationContext returns null when no active mission", () => {
    const dir = tmpDir()
    // No mission.json
    const ctx = createMockContext([[]])
    const hook = createPlanPersister(ctx, { directory: dir })

    expect(hook.buildRehydrationContext("ses_1")).toBeNull()
  })
})
