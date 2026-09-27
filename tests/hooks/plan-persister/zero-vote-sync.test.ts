/// <reference types="bun-types" />
/**
 * Zero-vote plan sync contract.
 *
 * A mission with no mission-linked task must still have its plan file stamped.
 * The zero-vote write is safe because `syncCheckboxesDetailed`
 * (src/features/mission-state/plan-storage.ts:139-145) returns every unmatched
 * line verbatim and only ever checks, never unchecks.
 */
import { describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { parseMetadataComment } from "../../../src/features/mission-state/plan-storage"
import { createPlanPersister } from "../../../src/hooks/plan-persister/hook"
import { TaskObjectSchema } from "../../../src/tools/task/types"

const SESSION_ID = "test-session-1"
const STALE_STAMP = "2000-01-01T00:00:00.000Z"

/** Strip the appended `<!-- plan-persister: {...} -->` block plus its blank line. */
function stripMetadata(content: string): string {
  return content.replace(/\n\n<!-- plan-persister:[\s\S]*?-->\n$/, "")
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

/** Write the plan file and the mission state that points at it. */
function setupFixture(dir: string, planName: string, planContent: string): string {
  const plansDir = join(dir, ".matrixx", "plans")
  mkdirSync(plansDir, { recursive: true })
  const planPath = join(plansDir, `${planName}.md`)
  writeFileSync(planPath, planContent, "utf-8")
  writeFileSync(
    join(dir, ".matrixx", "mission.json"),
    JSON.stringify({
      active_plan: planPath,
      started_at: "2026-07-10T20:00:00.000Z",
      session_ids: [SESSION_ID],
      plan_name: planName,
    }),
    "utf-8",
  )
  return planPath
}

function newDir(): string {
  const d = join(tmpdir(), `plan-zero-vote-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

/** Write a schema-valid task file. `description` is required by the strict schema. */
function writeTask(
  dir: string,
  id: string,
  subject: string,
  opts: { planName?: string; threadID?: string },
): void {
  const tasksDir = join(dir, ".matrixx", "tasks")
  mkdirSync(tasksDir, { recursive: true })
  const task = TaskObjectSchema.parse({
    id,
    subject,
    description: "",
    status: "completed",
    blocks: [],
    blockedBy: [],
    threadID: opts.threadID ?? SESSION_ID,
    projectRoot: dir,
    ...(opts.planName === undefined ? {} : { metadata: { planName: opts.planName } }),
  })
  writeFileSync(join(tasksDir, `${id}.json`), JSON.stringify(task, null, 2), "utf-8")
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function capture(dir: string): Promise<void> {
  return createPlanPersister(makeMockContext(), { directory: dir }).capture(SESSION_ID)
}

describe("plan-persister zero-vote sync", () => {
  it("refreshes a stale plan metadata stamp when no task is mission-linked", async () => {
    //#given
    const dir = newDir()
    const planPath = setupFixture(
      dir,
      "stale-stamp",
      `- [ ] Task one\n\n<!-- plan-persister: {"id":"stale-stamp","updatedAt":"${STALE_STAMP}","sessionId":"old-session","todoTotal":1,"todoCompleted":0} -->\n`,
    )
    const before = parseMetadataComment(readFileSync(planPath, "utf-8"))
    expect(before?.updatedAt).toBe(STALE_STAMP)
    expect(before?.sessionId).toBe("old-session")

    //#when
    await capture(dir)
    await tick()

    //#then
    const after = parseMetadataComment(readFileSync(planPath, "utf-8"))
    expect(after?.updatedAt).not.toBe(before?.updatedAt)
    expect(after?.updatedAt).not.toBe(STALE_STAMP)
    expect(after?.sessionId).toBe(SESSION_ID)
    expect(after?.id).toBe("stale-stamp")
  })

  it("stamps a plan that never carried a metadata comment", async () => {
    //#given
    const dir = newDir()
    const planPath = setupFixture(dir, "unstamped", "- [ ] Task one")
    expect(parseMetadataComment(readFileSync(planPath, "utf-8"))).toBeNull()

    //#when
    await capture(dir)
    await tick()

    //#then
    const meta = parseMetadataComment(readFileSync(planPath, "utf-8"))
    expect(meta).toBeTruthy()
    expect(meta?.sessionId).toBe(SESSION_ID)
    expect(Date.parse(meta?.updatedAt ?? "")).not.toBeNaN()
  })

  it("leaves every checkbox line byte-identical when no task is mission-linked", async () => {
    //#given
    const dir = newDir()
    const body = "- [x] already done\n- [ ] not started"
    const planPath = setupFixture(dir, "body-fence", body)

    //#when
    await capture(dir)
    await tick()

    //#then — exact string equality over the whole body, not a substring check
    const after = readFileSync(planPath, "utf-8")
    expect(stripMetadata(after)).toBe(body)
    expect(after).toContain("- [x] already done")
    expect(after).toContain("- [ ] not started")
  })

  it("still checks a box for a mission-linked completed task", async () => {
    //#given
    const dir = newDir()
    const planPath = setupFixture(dir, "linked", "- [ ] Set up authentication\n- [ ] Configure database")
    writeTask(dir, "T-linked-1", "Set up authentication", { planName: "linked" })

    //#when
    await capture(dir)
    await tick()

    //#then
    const after = readFileSync(planPath, "utf-8")
    expect(after).toContain("- [x] Set up authentication")
    expect(after).toContain("- [ ] Configure database")
  })

  it("never flips a checkbox for a task that is not mission-linked", async () => {
    //#given a completed task with no metadata.planName and a foreign threadID
    const dir = newDir()
    const planPath = setupFixture(dir, "unlinked", "- [ ] Set up authentication")
    writeTask(dir, "T-unlinked-1", "Set up authentication", { threadID: "some-other-session" })

    //#when
    await capture(dir)
    await tick()

    //#then
    expect(readFileSync(planPath, "utf-8")).toContain("- [ ] Set up authentication")
  })
})
