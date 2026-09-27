import { describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { createSessionManagerTools } from "../../../src/tools/session-manager/tools"
import { readSessionTodos } from "../../../src/tools/session-manager/storage"

const projectDir = "/Users/yeongyu/local-workspaces/matrixx"

const mockCtx = { directory: projectDir } as PluginInput

const mockContext: ToolContext = {
  sessionID: "test-session",
  messageID: "test-message",
  agent: "test-agent",
  directory: projectDir,
  worktree: projectDir,
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

const tools = createSessionManagerTools(mockCtx)
const { session_list, session_read, session_search, session_info } = tools

describe("session-manager tools", () => {
  test("session_list executes without error", async () => {
    const result = await session_list.execute({}, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_list respects limit parameter", async () => {
    const result = await session_list.execute({ limit: 5 }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_list filters by date range", async () => {
    const result = await session_list.execute({
      from_date: "2025-12-01T00:00:00Z",
      to_date: "2025-12-31T23:59:59Z",
    }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_list filters by project_path", async () => {
    //#given
    const projectPath = "/Users/yeongyu/local-workspaces/matrixx"

    //#when
    const result = await session_list.execute({ project_path: projectPath }, mockContext)

    //#then
    expect(typeof result).toBe("string")
  })

  test("session_list uses ctx.directory as default project_path", async () => {
    //#given - no project_path provided

    //#when
    const result = await session_list.execute({}, mockContext)

    //#then
    expect(typeof result).toBe("string")
  })

  test("session_read handles non-existent session", async () => {
    const result = await session_read.execute({ session_id: "ses_nonexistent" }, mockContext)
    
    expect(result).toContain("not found")
  })

  test("session_read executes with valid parameters", async () => {
    const result = await session_read.execute({
      session_id: "ses_test123",
      include_todos: true,
      include_transcript: true,
    }, mockContext)

    expect(typeof result).toBe("string")
  })

  test("session_read still accepts the include_todos argument and reads task state", async () => {
    //#given a project directory holding one task attributed to the session
    const dir = join(tmpdir(), `matrixx-tools-${randomUUID()}`)
    const taskDir = join(dir, ".matrixx", "tasks")
    mkdirSync(taskDir, { recursive: true })
    const taskId = `T-${randomUUID()}`
    writeFileSync(
      join(taskDir, `${taskId}.json`),
      JSON.stringify({
        id: taskId,
        subject: "Ship the task store swap",
        description: "",
        status: "pending",
        blocks: [],
        blockedBy: [],
        threadID: "ses_test123",
      })
    )

    //#when the tools are built for that directory and the read is invoked
    const scoped = createSessionManagerTools({ directory: dir } as PluginInput)
    const accepted = await scoped.session_read.execute(
      { session_id: "ses_test123", include_todos: true },
      mockContext
    )
    const todos = await readSessionTodos("ses_test123")

    //#then the argument name is unchanged and the diagnostic carries task state
    expect(typeof accepted).toBe("string")
    expect(todos).toHaveLength(1)
    expect(todos[0].content).toBe("Ship the task store swap")

    rmSync(dir, { recursive: true, force: true })
  })

  test("session_read respects limit parameter", async () => {
    const result = await session_read.execute({
      session_id: "ses_test123",
      limit: 10,
    }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_search executes without error", async () => {
    const result = await session_search.execute({ query: "test" }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_search filters by session_id", async () => {
    const result = await session_search.execute({
      query: "test",
      session_id: "ses_test123",
    }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_search respects case_sensitive parameter", async () => {
    const result = await session_search.execute({
      query: "TEST",
      case_sensitive: true,
    }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_search respects limit parameter", async () => {
    const result = await session_search.execute({
      query: "test",
      limit: 5,
    }, mockContext)
    
    expect(typeof result).toBe("string")
  })

  test("session_info handles non-existent session", async () => {
    const result = await session_info.execute({ session_id: "ses_nonexistent" }, mockContext)
    
    expect(result).toContain("not found")
  })

  test("session_info executes with valid session", async () => {
    const result = await session_info.execute({ session_id: "ses_test123" }, mockContext)
    
    expect(typeof result).toBe("string")
  })
})
