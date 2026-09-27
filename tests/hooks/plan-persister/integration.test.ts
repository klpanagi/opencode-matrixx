/**
 * Integration test: plan persistence round-trip.
 *
 * Simulates: plan creation → work → session.idle writes →
 * process restart (new PluginInput) → rehydration context matches original state.
 *
 * Progress is driven by mission-linked task files, the only source the
 * plan-persister hook reads.
 */
import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { parseMetadataComment, readPlanFile } from "../../../src/features/mission-state/plan-storage"
import { createPlanPersister } from "../../../src/hooks/plan-persister/hook"

function tmpDir(): string {
  const d = join(tmpdir(), `plan-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

function makeMockContext(): PluginInput {
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

function setupMission(dir: string, planName: string, planPath: string): void {
  const missionDir = join(dir, ".matrixx")
  mkdirSync(missionDir, { recursive: true })
  writeFileSync(
    join(missionDir, "mission.json"),
    JSON.stringify({
      active_plan: planPath,
      started_at: "2026-07-10T20:00:00.000Z",
      session_ids: ["integration-session"],
      plan_name: planName,
    }),
    "utf-8",
  )
}

/** Write a mission-linked task file under `.matrixx/tasks/`. */
function writeLinkedTask(
  dir: string,
  planName: string,
  subject: string,
  status: "pending" | "in_progress" | "completed",
): void {
  const tasksDir = join(dir, ".matrixx", "tasks")
  mkdirSync(tasksDir, { recursive: true })
  // One file per subject, so re-writing a subject updates its status in place.
  const id = `T-integration-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  writeFileSync(
    join(tasksDir, `${id}.json`),
    JSON.stringify({
      id,
      subject,
      description: subject,
      status,
      blocks: [],
      blockedBy: [],
      threadID: "integration-session",
      projectRoot: dir,
      metadata: { planName },
    }),
    "utf-8",
  )
}

/**
 * Scenario: Plan is generated → agent works through steps → session.idle
 * persists progress → process restarts (new PluginInput) → rehydration
 * correctly reads the persisted plan file.
 */
describe("plan persistence round-trip", () => {
  it("survives a simulated process restart with correct rehydration", async () => {
    //#given
    // Phase 1: Plan is generated
    const dir = tmpDir()
    const planPath = join(dir, ".matrixx", "plans", "integration-plan.md")
    const plansDir = join(dir, ".matrixx", "plans")
    mkdirSync(plansDir, { recursive: true })

    // Write initial plan (3 tasks, all pending)
    const initialPlan = [
      "# Integration Plan",
      "",
      "- [ ] Set up authentication",
      "- [ ] Configure database",
      "- [ ] Deploy to staging",
      "",
    ].join("\n")
    writeFileSync(planPath, initialPlan, "utf-8")
    setupMission(dir, "integration-plan", planPath)

    // Phase 2: Agent works, completing step 1
    writeLinkedTask(dir, "integration-plan", "Set up authentication", "completed")
    writeLinkedTask(dir, "integration-plan", "Configure database", "pending")
    writeLinkedTask(dir, "integration-plan", "Deploy to staging", "pending")
    const hook1 = createPlanPersister(makeMockContext(), { directory: dir })

    //#when
    // Simulate session.idle after step 1
    await hook1.event({
      event: { type: "session.idle", properties: { sessionID: "integration-session" } },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    //#then
    // Verify plan file shows step 1 completed
    const afterStep1 = readFileSync(planPath, "utf-8")
    expect(afterStep1).toContain("- [x] Set up authentication")
    expect(afterStep1).toContain("- [ ] Configure database")
    expect(afterStep1).toContain("- [ ] Deploy to staging")

    // Phase 3: Agent completes step 2
    writeLinkedTask(dir, "integration-plan", "Configure database", "completed")
    const hook2 = createPlanPersister(makeMockContext(), { directory: dir })

    await hook2.event({
      event: { type: "session.idle", properties: { sessionID: "integration-session" } },
    })
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Verify plan file shows steps 1 + 2 completed
    const afterStep2 = readFileSync(planPath, "utf-8")
    expect(afterStep2).toContain("- [x] Set up authentication")
    expect(afterStep2).toContain("- [x] Configure database")
    expect(afterStep2).toContain("- [ ] Deploy to staging")

    // Phase 4: Simulate process restart — fresh PluginInput, no in-memory state
    // The plan file on disk should have all the state we need
    const freshHook = createPlanPersister(makeMockContext(), { directory: dir })

    // Phase 5: Rehydrate and verify state matches
    const rehydrated = freshHook.buildRehydrationContext("integration-session")
    expect(rehydrated).toBeTruthy()
    expect(rehydrated!).toContain("Active Plan: integration-plan")
    expect(rehydrated!).toContain("2/3 tasks completed")
    expect(rehydrated!).toContain("- [x] Set up authentication")
    expect(rehydrated!).toContain("- [x] Configure database")
    expect(rehydrated!).toContain("- [ ] Deploy to staging")

    // Phase 6: Metadata comment is present and parseable
    const fileContent = readPlanFile(planPath)
    expect(fileContent).toBeTruthy()
    const meta = parseMetadataComment(fileContent!)
    expect(meta).toBeTruthy()
    expect(meta?.id).toBe("integration-plan")
    expect(meta?.todoTotal).toBe(3)
    expect(meta?.todoCompleted).toBe(2)
  })
})
