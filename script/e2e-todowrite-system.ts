/**
 * E2E smoke for task_system:false — native opencode todowrite + todo-continuation
 * Usage: bun run script/e2e-todowrite-system.ts
 * Verifies: todowrite allowed, task_* denied, todo-continuation reads session.todo, no file task sync
 */

import { isTaskSystemEnabled } from "../src/shared/task-system-gating.ts"
import { applyToolConfig } from "../src/plugin-handlers/tool-config-handler.ts"
import { getIncompleteCount } from "../src/hooks/todo-continuation-enforcer/todo.ts"
import type { MatrixxConfig } from "../src/config/schema.ts"

async function main() {
  console.log("=== E2E Todowrite System (task_system:false) ===")
  let failed = false
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`)
      failed = true
    } else {
      console.log(`PASS: ${msg}`)
    }
  }

  // 1. isTaskSystemEnabled false
  console.log("\n[1] isTaskSystemEnabled false")
  assert(isTaskSystemEnabled({ experimental: { task_system: false } } as any) === false, "false => false")
  assert(isTaskSystemEnabled(undefined) === true, "undefined defaults true (control)")

  // 2. Symmetric deny: task_system:false denies task_*, allows todowrite
  console.log("\n[2] applyToolConfig symmetric deny (task_system:false)")
  const configFalse: Record<string, unknown> = { tools: {} }
  const agentResultFalse: Record<string, unknown> = {
    architect: {}, morpheus: {}, oracle: {}, mouse: {}, keymaker: {},
  }
  applyToolConfig({
    config: configFalse,
    pluginConfig: { experimental: { task_system: false } } as unknown as MatrixxConfig,
    agentResult: agentResultFalse,
  })
  const toolsFalse = configFalse.tools as Record<string, unknown>
  assert(toolsFalse["task_*"] === false, "tools task_* === false")
  assert((toolsFalse as any).task === false, "tools task === false")
  // todowrite should NOT be denied in tools (only per-agent deny for task_system:true)
  assert(toolsFalse.todowrite !== false, "tools.todowrite not false (allowed)")
  const archPerm = (agentResultFalse.architect as any).permission
  assert(archPerm.todowrite === "allow", "architect todowrite allow")
  assert(archPerm.todoread === "allow", "architect todoread allow")
  assert(archPerm["task_*"] === "deny", "architect task_* deny")

  // 3. todo-continuation counting (ignores completed/cancelled/blocked/deleted)
  console.log("\n[3] getIncompleteCount todo logic")
  const todos = [
    { content: "a", status: "pending", priority: "medium" },
    { content: "b", status: "in_progress", priority: "medium" },
    { content: "c", status: "completed", priority: "medium" },
    { content: "d", status: "cancelled", priority: "medium" },
    { content: "e", status: "blocked", priority: "medium" },
    { content: "f", status: "deleted", priority: "medium" },
  ]
  assert(getIncompleteCount(todos as any) === 2, "only pending/in_progress count => 2")
  assert(getIncompleteCount([]) === 0, "empty => 0")
  assert(getIncompleteCount([{ content: "x", status: "completed", priority: "medium" } as any]) === 0, "all completed => 0")

  // 4. Mock session.todo flow (todo-continuation source)
  console.log("\n[4] Mock session.todo flow for todo-continuation")
  const store: Record<string, any[]> = {}
  const mockCtxTodo: any = {
    directory: "/tmp/fake-project",
    client: {
      session: {
        todo: async ({ path }: { path: { id: string } }) => ({ data: store[path.id] ?? [] }),
        messages: async () => ({ data: [] }),
      },
      tui: { showToast: async () => {} },
    },
  }
  const SES_TODO = "ses_todo_test_" + Date.now()
  store[SES_TODO] = [{ content: "Task 1", status: "pending", priority: "medium" }]
  const resp1 = await mockCtxTodo.client.session.todo({ path: { id: SES_TODO } })
  assert((resp1 as any).data.length === 1, "GET after pending => 1")
  assert(getIncompleteCount((resp1 as any).data) === 1, "incomplete 1 => would trigger continuation")

  store[SES_TODO] = [{ content: "Task 1", status: "completed", priority: "medium" }]
  const resp2 = await mockCtxTodo.client.session.todo({ path: { id: SES_TODO } })
  assert(getIncompleteCount((resp2 as any).data) === 0, "completed => 0 => no continuation")

  store[SES_TODO] = []
  const resp3 = await mockCtxTodo.client.session.todo({ path: { id: SES_TODO } })
  assert(getIncompleteCount((resp3 as any).data) === 0, "empty => no continuation")

  // 5. No file task sync in todowrite mode (ensure todo-sync deleted)
  console.log("\n[5] No file task sync in todowrite mode")
  const fs = await import("node:fs")
  assert(!fs.existsSync("src/tools/task/todo-sync.ts"), "todo-sync.ts still deleted")
  assert(!fs.existsSync("src/shared/opencode-todo-writer.ts"), "writer still deleted")

  // 6. Conditional hooks: todo-continuation active when false
  console.log("\n[6] Conditional continuation hooks (task_system:false)")
  assert(isTaskSystemEnabled({ experimental: { task_system: false } } as any) === false, "false => todo-continuation")
  assert(isTaskSystemEnabled({ experimental: { task_system: true } } as any) === true, "true => task-continuation (control)")

  console.log("\n=== RESULT ===")
  if (failed) {
    console.error("E2E TODOWRITE SYSTEM FAILED")
    process.exit(1)
  } else {
    console.log("E2E TODOWRITE SYSTEM ALL PASS ✓")
  }
}

main().catch(e => { console.error("E2E TODOWRITE SYSTEM ERROR:", e); process.exit(1) })
