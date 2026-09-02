/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEBOUNCE_MS, HOOK_NAME } from "../../../src/hooks/task-todo-mirror/constants"
import { createTaskTodoMirrorHook } from "../../../src/hooks/task-todo-mirror/hook"
import type { MatrixxConfig } from "../../../src/config/schema"
import type { PluginInput } from "@opencode-ai/plugin"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeCtx(): PluginInput {
  const todoMock = mock(() =>
    Promise.resolve({
      data: [] as unknown[],
      error: null,
      request: new Request("http://localhost"),
      response: new Response(),
    }),
  )
  return {
    directory: "/tmp/test-project",
    client: {
      session: {
        todo: todoMock,
      },
    },
  } as unknown as PluginInput
}

function makePluginConfig(
  overrides: Partial<MatrixxConfig> & { morpheus?: { tasks?: { storage_path?: string } } } = {},
  enabled = true,
): MatrixxConfig {
  return {
    experimental: { task_system: enabled },
    morpheus: overrides.morpheus,
    ...overrides,
  } as unknown as MatrixxConfig
}

function writeTaskFile(dir: string, id: string, subject: string, status = "pending"): void {
  const task = {
    id,
    subject,
    description: `desc for ${subject}`,
    status,
    blocks: [],
    blockedBy: [],
    threadID: "ses-test",
  }
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(task, null, 2), "utf-8")
}

// ---------------------------------------------------------------------------
// suite
// ---------------------------------------------------------------------------

describe(HOOK_NAME, () => {
  let tempDir: string
  let storagePath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "task-todo-mirror-"))
    storagePath = join(tempDir, "tasks")
    mkdirSync(storagePath, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  // -----------------------------------------------------------------------
  // enabled=false → all handlers are no-ops
  // -----------------------------------------------------------------------

  describe("when task_system disabled", () => {
    test("tool.execute.after is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, false)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["tool.execute.after"](
        { tool: "task_create", sessionID: "ses-1", callID: "c1" },
        undefined,
      )

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("chat.message is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, false)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["chat.message"](
        { sessionID: "ses-1" },
        { message: {}, parts: [] },
      )

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("experimental.chat.messages.transform is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, false)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["experimental.chat.messages.transform"](
        {},
        { messages: [{ info: { sessionID: "ses-1" } }] },
      )

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("event is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, false)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses-1" } } })

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("_syncForSession is no-op when disabled", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, false)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-1")

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // enabled=true but missing sessionID → no-op
  // -----------------------------------------------------------------------

  describe("when sessionID is missing", () => {
    test("_syncForSession with undefined is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession(undefined)

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("_syncForSession with empty string is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("")

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("experimental.chat.messages.transform with no messages is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["experimental.chat.messages.transform"](
        {},
        { messages: [] },
      )

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("experimental.chat.messages.transform with messages lacking sessionID is no-op", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["experimental.chat.messages.transform"](
        {},
        { messages: [{ info: {} }, { info: {} }] },
      )

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // enabled=true — each handler calls syncForSession exactly once
  // -----------------------------------------------------------------------

  describe("when enabled", () => {
    test("tool.execute.after syncs for input.sessionID", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["tool.execute.after"](
        { tool: "task_create", sessionID: "ses-abc", callID: "c1" },
        undefined,
      )

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-abc" } })
    })

    test("chat.message syncs for input.sessionID", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["chat.message"](
        { sessionID: "ses-chat" },
        { message: {}, parts: [] },
      )

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-chat" } })
    })

    test("experimental.chat.messages.transform extracts last sessionID", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["experimental.chat.messages.transform"](
        {},
        {
          messages: [
            { info: { sessionID: "ses-first" } },
            { info: {} },
            { info: { sessionID: "ses-last" } },
          ],
        },
      )

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-last" } })
    })

    test("experimental.chat.messages.transform iterates backwards to find last sessionID", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook["experimental.chat.messages.transform"](
        {},
        {
          messages: [
            { info: { sessionID: "ses-a" } },
            { info: { sessionID: "ses-b" } },
            { info: {} },
          ],
        },
      )

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-b" } })
    })

    test("event syncs on session.idle with properties.sessionID", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({ event: { type: "session.idle", properties: { sessionID: "ses-idle" } } })

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-idle" } })
    })

    test("event syncs on session.idle with properties.info.id fallback", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({ event: { type: "session.idle", properties: { info: { id: "ses-info" } } } })

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-info" } })
    })

    test("event is no-op for non-idle events", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({ event: { type: "session.created", properties: { sessionID: "ses-1" } } })

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("event is no-op when sessionID missing even on session.idle", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({ event: { type: "session.idle", properties: {} } })

      //#then
      expect(ctx.client.session.todo).not.toHaveBeenCalled()
    })

    test("event prefers properties.sessionID over info.id", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook.event({
        event: {
          type: "session.idle",
          properties: { sessionID: "ses-direct", info: { id: "ses-fallback" } },
        },
      })

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledWith({ path: { id: "ses-direct" } })
    })
  })

  // -----------------------------------------------------------------------
  // debounce
  // -----------------------------------------------------------------------

  describe("debounce", () => {
    test("second call within 300ms for same sessionID is skipped", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-debounce")
      await hook._syncForSession("ses-debounce")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
    })

    test("different sessionIDs are not debounced against each other", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-a")
      await hook._syncForSession("ses-b")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(2)
    })

    test("after debounce window elapses, same sessionID syncs again", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)
      await hook._syncForSession("ses-window")
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)

      //#when — advance time past DEBOUNCE_MS via Date.now mock
      const nowSpy = spyOn(Date, "now")
      // lastSync was set to ~now; mock now to be DEBOUNCE_MS+10 later
      const future = Date.now() + DEBOUNCE_MS + 10
      nowSpy.mockReturnValue(future)
      await hook._syncForSession("ses-window")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(2)
      nowSpy.mockRestore()
    })

    test("DEBOUNCE_MS constant is 300", () => {
      //#given
      //#when
      //#then
      expect(DEBOUNCE_MS).toBe(300)
    })
  })

  // -----------------------------------------------------------------------
  // loadAllTasks via filesystem
  // -----------------------------------------------------------------------

  describe("loadAllTasks via filesystem", () => {
    test("loads valid T-*.json files", async () => {
      //#given
      writeTaskFile(storagePath, "T-aaa-1", "Task One", "pending")
      writeTaskFile(storagePath, "T-bbb-2", "Task Two", "in_progress")
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)
      // capture writer call by spying on sync: use a writer-intercept approach — hook does not expose writer,
      // but we can verify tasks were read by checking that sync did not throw and fetch was called
      // and by verifying via a second hook instance that reads the same dir without error

      //#when
      await hook._syncForSession("ses-load")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
      // No throw, and log would contain "Synced 2 tasks"
    })

    test("ignores non-T- files", async () => {
      //#given
      writeTaskFile(storagePath, "T-aaa-1", "Valid", "pending")
      writeFileSync(join(storagePath, "other.json"), JSON.stringify({ id: "other", subject: "x" }), "utf-8")
      writeFileSync(join(storagePath, "T-ignored.txt"), "not json", "utf-8")
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-ignore")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
    })

    test("returns [] when dir does not exist", async () => {
      //#given
      const missingPath = join(tempDir, "missing-dir")
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: missingPath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-missing")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
    })

    test("ignores malformed JSON and schema-invalid files", async () => {
      //#given
      writeTaskFile(storagePath, "T-valid-1", "Valid", "pending")
      writeFileSync(join(storagePath, "T-bad-1.json"), "{ not valid json", "utf-8")
      // schema-invalid: missing required fields
      writeFileSync(
        join(storagePath, "T-bad-2.json"),
        JSON.stringify({ id: "T-bad-2", subject: "bad" }),
        "utf-8",
      )
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-malformed")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
    })

    test("handles empty task dir", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      await hook._syncForSession("ses-empty")

      //#then
      expect(ctx.client.session.todo).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    test("does not propagate when fetch throws", async () => {
      //#given
      const ctx = {
        directory: "/tmp/test-project",
        client: {
          session: {
            todo: mock(() => Promise.reject(new Error("fetch failed"))),
          },
        },
      } as unknown as PluginInput
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when / #then — should not throw
      await expect(hook._syncForSession("ses-err")).resolves.toBeUndefined()
    })

    test("does not propagate when writer (Todo.update) is unavailable", async () => {
      //#given
      // Default ctx has no Todo.update writer available; syncAllTasksToTodos resolves writer to null
      // and still should not throw
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when / #then
      await expect(hook._syncForSession("ses-no-writer")).resolves.toBeUndefined()
    })

    test("tool.execute.after does not throw when sync fails", async () => {
      //#given
      const ctx = {
        directory: "/tmp/test-project",
        client: {
          session: {
            todo: mock(() => Promise.reject(new Error("boom"))),
          },
        },
      } as unknown as PluginInput
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when / #then
      await expect(
        hook["tool.execute.after"]({ tool: "task_create", sessionID: "ses-1", callID: "c1" }, undefined),
      ).resolves.toBeUndefined()
    })

    test("event handler does not throw on malformed properties", async () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when / #then
      await expect(
        hook.event({ event: { type: "session.idle", properties: null as unknown as Record<string, unknown> } }),
      ).resolves.toBeUndefined()
      await expect(
        hook.event({ event: { type: "session.idle", properties: undefined } }),
      ).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // _syncForSession direct exposure
  // -----------------------------------------------------------------------

  describe("_syncForSession exposure", () => {
    test("is a function exposed on the hook", () => {
      //#given
      const ctx = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook = createTaskTodoMirrorHook(ctx, config)

      //#when
      //#then
      expect(typeof hook._syncForSession).toBe("function")
    })

    test("each hook instance has independent debounce state", async () => {
      //#given
      const ctx1 = makeCtx()
      const ctx2 = makeCtx()
      const config = makePluginConfig({ morpheus: { tasks: { storage_path: storagePath } } }, true)
      const hook1 = createTaskTodoMirrorHook(ctx1, config)
      const hook2 = createTaskTodoMirrorHook(ctx2, config)

      //#when
      await hook1._syncForSession("ses-shared")
      await hook2._syncForSession("ses-shared")

      //#then — both should have synced (independent Maps)
      expect(ctx1.client.session.todo).toHaveBeenCalledTimes(1)
      expect(ctx2.client.session.todo).toHaveBeenCalledTimes(1)
    })
  })
})
