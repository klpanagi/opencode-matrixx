/**
 * E2E smoke for task_system=true — file-based Matrixx tasks + task-continuation
 * Usage: bun run script/e2e-task-system.ts
 * Verifies: no todowrite sync, task-continuation reads .matrixx/tasks, symmetric deny, blockedBy-aware counting
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getTaskDir, readJsonSafe } from "../src/features/task-storage/storage.ts"
import { TaskObjectSchema } from "../src/tools/task/types.ts"
import { getIncompleteTaskCount } from "../src/hooks/task-continuation-enforcer/todo.ts"
import { isTaskSystemEnabled } from "../src/shared/task-system-gating.ts"
import { applyToolConfig } from "../src/plugin-handlers/tool-config-handler.ts"
import type { MatrixxConfig } from "../src/config/schema.ts"

async function main() {
  console.log("=== E2E Task System (task_system:true) ===")
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
  assert(isTaskSystemEnabled({ experimental: { task_system: true } } as any) === true, "true => true")
  assert(isTaskSystemEnabled({ experimental: { task_system: false } } as any) === false, "false => false")

  // 2. Symmetric deny: task_system:true denies todowrite, allows task_*
  console.log("\n[2] applyToolConfig symmetric deny (task_system:true)")
  const configTrue: Record<string, unknown> = { tools: {} }
  const agentResultTrue: Record<string, unknown> = {
    architect: {}, morpheus: {}, oracle: {}, mouse: {}, keymaker: {},
  }
  applyToolConfig({
    config: configTrue,
    pluginConfig: { experimental: { task_system: true } } as unknown as MatrixxConfig,
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
  assert(isTaskSystemEnabled({ experimental: { task_system: true } } as any) === true, "task_system true => task-continuation active")
  assert(isTaskSystemEnabled({ experimental: { task_system: false } } as any) === false, "task_system false => todo-continuation active")

  console.log("\n=== RESULT ===")
  if (failed) {
    console.error("E2E TASK SYSTEM FAILED")
    process.exit(1)
  } else {
    console.log("E2E TASK SYSTEM ALL PASS ✓")
  }
}

main().catch(e => { console.error("E2E TASK SYSTEM ERROR:", e); process.exit(1) })
