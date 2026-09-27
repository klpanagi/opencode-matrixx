/**
 * E2E smoke for the unconditional file-based Matrixx task system + task-continuation
 * Usage: bun run script/e2e-task-system.ts
 * Verifies: legacy todo tools stay denied, no todo sync layer, task-continuation
 * reads .matrixx/tasks, blockedBy-aware counting
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateTaskId, getTaskDir, listTaskFiles, readJsonSafe, writeJsonAtomic } from "../src/features/task-storage/storage.ts"
import type { TaskObject } from "../src/tools/task/types.ts"
import { TaskObjectSchema } from "../src/tools/task/types.ts"
import { getIncompleteTaskCount } from "../src/hooks/task-continuation-enforcer/todo.ts"
import { isTaskSystemEnabled } from "../src/shared/task-system-gating.ts"
import { applyToolConfig } from "../src/plugin-handlers/tool-config-handler.ts"
import type { MatrixxConfig } from "../src/config/schema.ts"

async function main() {
  console.log("=== E2E Task System (task system is unconditional) ===")
  let failed = false
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`PASS: ${msg}`)
    }
  }

  // 1. isTaskSystemEnabled defaults true
  console.log("\n[1] isTaskSystemEnabled defaults")
  assert(isTaskSystemEnabled(undefined) === true, "undefined => true")
  assert(isTaskSystemEnabled({ experimental: { task_system: true } }) === true, "true => true")

  // 2. Unconditional deny: the legacy todo tools stay denied and task_* is allowed
  console.log("\n[2] applyToolConfig symmetric deny (unconditional)")
  const configTrue: Record<string, unknown> = { tools: {} }
  const agentResultTrue: Record<string, unknown> = {
    architect: {}, morpheus: {}, oracle: {}, mouse: {}, keymaker: {},
  }
  applyToolConfig({
    config: configTrue,
    pluginConfig: {} as unknown as MatrixxConfig,
    agentResult: agentResultTrue,
  })
  const toolsTrue = configTrue.tools as Record<string, unknown>
  assert(toolsTrue.todowrite === false, "tools.todowrite === false")
  assert(toolsTrue.todoread === false, "tools.todoread === false")
  const archPerm = (agentResultTrue.architect as any).permission
  assert(archPerm["task_*"] === "allow", "architect task_* allow")
  assert(archPerm.todowrite === "deny", "architect todowrite deny")

  // 3. No sync layer files
  console.log("\n[3] No todowrite sync layer")
  assert(!existsSync("src/tools/task/todo-sync.ts"), "todo-sync.ts deleted")
  assert(!existsSync("src/shared/opencode-todo-writer.ts"), "opencode-todo-writer.ts deleted")
  assert(!existsSync("src/hooks/task-todo-mirror"), "task-todo-mirror deleted")
  assert(!existsSync("src/hooks/todo-description-override"), "todo-description-override deleted")

  // 4. File-based task counting with blockedBy
  console.log("\n[4] getIncompleteTaskCount blockedBy-aware")
  const tmpDir = mkdtempSync(join(tmpdir(), "e2e-task-"))
  try {
    const taskDir = getTaskDir({}, tmpDir)
    mkdirSync(taskDir, { recursive: true })
    const t1 = { id: "T-aaaa", subject: "A", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses1" }
    const t2 = { id: "T-bbbb", subject: "B blocked by A", description: "", status: "pending", blocks: [], blockedBy: ["T-aaaa"], threadID: "ses1" }
    const t3 = { id: "T-cccc", subject: "C completed", description: "", status: "completed", blocks: [], blockedBy: [], threadID: "ses1" }
    for (const t of [t1, t2, t3]) {
      const parsed = TaskObjectSchema.parse(t)
      writeFileSync(join(taskDir, `${t.id}.json`), JSON.stringify(parsed))
    }
    const files = readdirSync(taskDir)
    assert(files.length === 3, "3 task files written")
    const tasks = files.map(f => readJsonSafe(join(taskDir, f), TaskObjectSchema)!).filter(Boolean) as any[]
    assert(getIncompleteTaskCount(tasks) === 1, "only A continuable (B blocked) => 1")

    // Mark A completed => B becomes continuable
    writeFileSync(join(taskDir, "T-aaaa.json"), JSON.stringify({ ...t1, status: "completed" }))
    const tasks2 = readdirSync(taskDir).map(f => readJsonSafe(join(taskDir, f), TaskObjectSchema)!).filter(Boolean) as any[]
    assert(getIncompleteTaskCount(tasks2) === 1, "B now continuable => 1 (B)")

    // Mark B completed => 0
    writeFileSync(join(taskDir, "T-bbbb.json"), JSON.stringify({ ...t2, status: "completed" }))
    const tasks3 = readdirSync(taskDir).map(f => readJsonSafe(join(taskDir, f), TaskObjectSchema)!).filter(Boolean) as any[]
    assert(getIncompleteTaskCount(tasks3) === 0, "all completed => 0")
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  // 5. task-continuation reads file tasks (mock idle)
  console.log("\n[5] task-continuation handleSessionIdle reads file tasks")
  const tmpDir2 = mkdtempSync(join(tmpdir(), "e2e-task-idle-"))
  let countdownTriggered = false
  try {
    const taskDir = getTaskDir({}, tmpDir2)
    mkdirSync(taskDir, { recursive: true })
    const t = TaskObjectSchema.parse({ id: "T-ffff", subject: "idle test", description: "", status: "pending", blocks: [], blockedBy: [], threadID: "ses1" })
    writeFileSync(join(taskDir, "T-ffff.json"), JSON.stringify(t))

    // Mock PluginInput with directory temp, minimal client for messages
    const mockCtx: any = {
      directory: tmpDir2,
      client: {
        session: {
          messages: async () => ({ data: [] }),
        },
        tui: {
          showToast: async () => {},
        },
      },
    }
    // We test getIncompleteTaskCount directly as proxy for idle logic (full idle also checks abort, bg tasks, etc.)
    const tasks = readdirSync(taskDir).map(f => readJsonSafe(join(taskDir, f), TaskObjectSchema)!).filter(Boolean) as any[]
    const count = getIncompleteTaskCount(tasks)
    assert(count === 1, "idle would see 1 incomplete => would trigger countdown")
    countdownTriggered = count > 0
    assert(countdownTriggered, "countdown would trigger")
  } finally {
    rmSync(tmpDir2, { recursive: true, force: true })
  }

  // 6. Conditional hooks registration
  console.log("\n[6] Conditional continuation hooks")
  // We verify via isTaskSystemEnabled that correct hook would be chosen
  // (full createContinuationHooks test requires plugin context, so we test gating only)
  assert(isTaskSystemEnabled({ experimental: { task_system: true } }) === true, "task_system true => task-continuation active")

  // 7. I3 fence: create → update → list → get → cleanup round-trip on .matrixx/tasks/T-{uuid}.json
  console.log("\n[7] Task storage round-trip (I3 behavior-preservation fence)")
  const tmpDir3 = mkdtempSync(join(tmpdir(), "e2e-task-roundtrip-"))
  try {
    const taskDir = getTaskDir({}, tmpDir3)
    mkdirSync(taskDir, { recursive: true })

    //#given a fresh project-scoped task directory
    const id = generateTaskId()
    assert(/^T-[0-9a-f-]{8,}$/.test(id), `generated id has the T-{uuid} shape (${id})`)

    //#when the task is created via the same atomic writer the tools use
    const created = TaskObjectSchema.parse({
      id,
      subject: "round-trip subject",
      description: "created",
      status: "pending",
      blocks: [],
      blockedBy: [],
      threadID: "ses-roundtrip",
    })
    writeJsonAtomic(join(taskDir, `${id}.json`), created)
    assert(existsSync(join(taskDir, `${id}.json`)), "create writes .matrixx/tasks/T-{uuid}.json")

    //#when the task is listed
    const listed = listTaskFiles({}, tmpDir3)
    assert(listed.includes(id), "list finds the created task id")

    //#when the task is fetched
    const fetched = readJsonSafe(join(taskDir, `${id}.json`), TaskObjectSchema)
    assert(fetched?.subject === "round-trip subject", "get returns the created task")

    //#when the task is updated
    const updated = TaskObjectSchema.parse({ ...fetched, status: "completed", description: "updated" })
    writeJsonAtomic(join(taskDir, `${id}.json`), updated)
    const refetched = readJsonSafe(join(taskDir, `${id}.json`), TaskObjectSchema)
    assert(refetched?.status === "completed" && refetched?.description === "updated", "update persists in place")

    //#when the completed task is excluded from the incomplete count
    const all = readdirSync(taskDir)
      .map(f => readJsonSafe(join(taskDir, f), TaskObjectSchema))
      .filter((t): t is TaskObject => t !== null)
    assert(getIncompleteTaskCount(all) === 0, "completed task is not counted as continuable")

    //#and no legacy side-channel mirror files were written alongside it
    const strays = readdirSync(taskDir).filter(f => !/^T-[0-9a-f-]+\.json$/.test(f))
    assert(strays.length === 0, `no side-channel files in the task dir (${strays.join(", ") || "none"})`)

    //#when the task is cleaned up
    unlinkSync(join(taskDir, `${id}.json`))
    assert(!existsSync(join(taskDir, `${id}.json`)), "cleanup removes the task file")
    assert(!listTaskFiles({}, tmpDir3).includes(id), "cleanup is visible to list")
  } finally {
    rmSync(tmpDir3, { recursive: true, force: true })
  }

  console.log("\n=== RESULT ===")
  if (failed) {
    console.error("E2E TASK SYSTEM FAILED")
    process.exit(1)
  } else {
    console.log("E2E TASK SYSTEM ALL PASS ✓")
  }
}

main().catch(e => { console.error("E2E TASK SYSTEM ERROR:", e); process.exit(1) })
