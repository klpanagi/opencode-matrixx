import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { MatrixxConfig } from "../../src/config"
import { _resetForTesting, setMainSession, subagentSessions } from "../../src/features/session-state"
import { createSessionNotification } from "../../src/hooks/session-notification"
import * as utils from "../../src/hooks/session-notification-utils"
import { TaskObjectSchema } from "../../src/tools/task/types"

const TASK_STORE_TEST_ROOT = join(tmpdir(), "matrixx-session-notification-tests")

describe("session-notification", () => {
  let notificationCalls: string[]

  function createMockPluginInput(directory = "/tmp/test") {
    return {
      $: async (cmd: TemplateStringsArray | string, ...values: unknown[]) => {
        // given - track notification commands (osascript, notify-send, powershell)
        const cmdStr = typeof cmd === "string" 
          ? cmd 
          : cmd.reduce((acc, part, i) => acc + part + (values[i] ?? ""), "")
        
        if (cmdStr.includes("osascript") || cmdStr.includes("notify-send") || cmdStr.includes("powershell")) {
          notificationCalls.push(cmdStr)
        }
        return { stdout: "", stderr: "", exitCode: 0 }
      },
      client: {
        session: {
          todo: async () => ({ data: [] }),
        },
      },
      directory,
    } as unknown as PluginInput
  }

  /**
   * Write a single file-backed task into `<root>/.matrixx/tasks/`.
   * `TaskObjectSchema` is `.strict()` and `threadID` is required, so a task with no
   * session attribution would be structurally invisible to the predicate.
   */
  function writeTask(root: string, id: string, threadID: string): void {
    const taskDir = join(root, ".matrixx", "tasks")
    mkdirSync(taskDir, { recursive: true })
    writeFileSync(
      join(taskDir, `${id}.json`),
      JSON.stringify({
        id,
        subject: "Wire the idle-suppression predicate",
        description: "Bound predicate over the file-backed task store.",
        status: "pending",
        blocks: [],
        blockedBy: [],
        threadID,
      }),
    )
  }

  /**
   * Write a task into an arbitrary task directory.
   * Uses `TaskObjectSchema.parse` because a hand-rolled object that fails the
   * `.strict()` schema is indistinguishable from "no pending work" to the predicate.
   */
  function writeTaskInto(
    taskDir: string,
    id: string,
    threadID: string,
    projectRoot: string,
    status: "pending" | "in_progress" = "in_progress"
  ): void {
    mkdirSync(taskDir, { recursive: true })
    const task = TaskObjectSchema.parse({
      id,
      subject: "Wire the idle-suppression predicate",
      description: "Bound predicate over the file-backed task store.",
      status,
      blocks: [],
      blockedBy: [],
      threadID,
      projectRoot,
    })
    writeFileSync(join(taskDir, `${id}.json`), JSON.stringify(task))
  }

  const tempDirs: string[] = []

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "matrixx-sessnotif-"))
    tempDirs.push(dir)
    return dir
  }

  beforeEach(() => {
    _resetForTesting()
    notificationCalls = []
    
    spyOn(utils, "getOsascriptPath").mockResolvedValue("/usr/bin/osascript")
    spyOn(utils, "getNotifySendPath").mockResolvedValue("/usr/bin/notify-send")
    spyOn(utils, "getPowershellPath").mockResolvedValue("powershell")
    spyOn(utils, "getAfplayPath").mockResolvedValue("/usr/bin/afplay")
    spyOn(utils, "getPaplayPath").mockResolvedValue("/usr/bin/paplay")
    spyOn(utils, "getAplayPath").mockResolvedValue("/usr/bin/aplay")
    spyOn(utils, "startBackgroundCheck").mockImplementation(() => {})
  })

  afterEach(() => {
    // given - cleanup after each test
    subagentSessions.clear()
    _resetForTesting()
    rmSync(TASK_STORE_TEST_ROOT, { recursive: true, force: true })
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
    tempDirs.length = 0
  })

  test("should not trigger notification for subagent session", async () => {
    // given - a subagent session exists
    const subagentSessionID = "subagent-123"
    subagentSessions.add(subagentSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 0,
    })

    // when - subagent session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: subagentSessionID },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - notification should NOT be sent
    expect(notificationCalls).toHaveLength(0)
  })

  test("should not trigger notification when mainSessionID is set and session is not main", async () => {
    // given - main session is set, but a different session goes idle
    const mainSessionID = "main-123"
    const otherSessionID = "other-456"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 0,
    })

    // when - non-main session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: otherSessionID },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - notification should NOT be sent
    expect(notificationCalls).toHaveLength(0)
  })

  test("should trigger notification for main session when idle", async () => {
    // given - main session is set
    const mainSessionID = "main-789"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 10,
      skipIfIncompleteTodos: false,
    })

    // when - main session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    // Wait for idle confirmation delay + buffer
    await new Promise((resolve) => setTimeout(resolve, 100))

    // then - notification should be sent
    expect(notificationCalls.length).toBeGreaterThanOrEqual(1)
  })

  test("should skip notification for subagent even when mainSessionID is set", async () => {
    // given - both mainSessionID and subagent session exist
    const mainSessionID = "main-999"
    const subagentSessionID = "subagent-888"
    setMainSession(mainSessionID)
    subagentSessions.add(subagentSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 0,
    })

    // when - subagent session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: subagentSessionID },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - notification should NOT be sent (subagent check takes priority)
    expect(notificationCalls).toHaveLength(0)
  })

  test("should handle subagentSessions and mainSessionID checks in correct order", async () => {
    // given - main session and subagent session exist
    const mainSessionID = "main-111"
    const subagentSessionID = "subagent-222"
    const unknownSessionID = "unknown-333"
    setMainSession(mainSessionID)
    subagentSessions.add(subagentSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 0,
    })

    // when - subagent session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: subagentSessionID },
      },
    })

    // when - unknown session goes idle (not main, not in subagentSessions)
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: unknownSessionID },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - no notifications (subagent blocked by subagentSessions, unknown blocked by mainSessionID check)
    expect(notificationCalls).toHaveLength(0)
  })

  test("should cancel pending notification on session activity", async () => {
    // given - main session is set
    const mainSessionID = "main-cancel"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 100, // Long delay
      skipIfIncompleteTodos: false,
    })

    // when - session goes idle
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    // when - activity happens before delay completes
    await hook({
      event: {
        type: "tool.execute.before",
        properties: { sessionID: mainSessionID },
      },
    })

    // Wait for original delay to pass
    await new Promise((resolve) => setTimeout(resolve, 150))

    // then - notification should NOT be sent (cancelled by activity)
    expect(notificationCalls).toHaveLength(0)
  })

  test("should handle session.created event without notification", async () => {
    // given - a new session is created
    const hook = createSessionNotification(createMockPluginInput(), {})

    // when - session.created event fires
    await hook({
      event: {
        type: "session.created",
        properties: {
          info: { id: "new-session", title: "Test Session" },
        },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - no notification should be triggered
    expect(notificationCalls).toHaveLength(0)
  })

  test("should handle session.deleted event and cleanup state", async () => {
    // given - a session exists
    const hook = createSessionNotification(createMockPluginInput(), {})

    // when - session.deleted event fires
    await hook({
      event: {
        type: "session.deleted",
        properties: {
          info: { id: "deleted-session" },
        },
      },
    })

    // Wait for any pending timers
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - no notification should be triggered
    expect(notificationCalls).toHaveLength(0)
  })

  test("should mark session activity on message.updated event", async () => {
    // given - main session is set
    const mainSessionID = "main-message"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 50,
      skipIfIncompleteTodos: false,
    })

    // when - session goes idle, then message.updated fires
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    await hook({
      event: {
        type: "message.updated",
        properties: {
          info: { sessionID: mainSessionID, role: "user", finish: false },
        },
      },
    })

    // Wait for idle delay to pass
    await new Promise((resolve) => setTimeout(resolve, 100))

    // then - notification should NOT be sent (activity cancelled it)
    expect(notificationCalls).toHaveLength(0)
  })

  test("should mark session activity on tool.execute.before event", async () => {
    // given - main session is set
    const mainSessionID = "main-tool"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 50,
      skipIfIncompleteTodos: false,
    })

    // when - session goes idle, then tool.execute.before fires
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    await hook({
      event: {
        type: "tool.execute.before",
        properties: { sessionID: mainSessionID },
      },
    })

    // Wait for idle delay to pass
    await new Promise((resolve) => setTimeout(resolve, 100))

    // then - notification should NOT be sent (activity cancelled it)
    expect(notificationCalls).toHaveLength(0)
  })

  test("should not send duplicate notification for same session", async () => {
    // given - main session is set
    const mainSessionID = "main-dup"
    setMainSession(mainSessionID)

    const hook = createSessionNotification(createMockPluginInput(), {
      idleConfirmationDelay: 10,
      skipIfIncompleteTodos: false,
    })

    // when - session goes idle twice
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    // Wait for first notification
    await new Promise((resolve) => setTimeout(resolve, 50))

    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID: mainSessionID },
      },
    })

    // Wait for second potential notification
    await new Promise((resolve) => setTimeout(resolve, 50))

    // then - only one notification should be sent
    expect(notificationCalls).toHaveLength(1)
  })

  test("should suppress notification while the notified session has its own pending task", async () => {
    //#given
    const root = join(TASK_STORE_TEST_ROOT, "own-pending-task")
    mkdirSync(root, { recursive: true })
    writeTask(root, "T-11111111-1111-4111-8111-111111111111", "ses_target")
    const sessionID = "ses_target"
    setMainSession(sessionID)

    const hook = createSessionNotification(createMockPluginInput(root), {
      idleConfirmationDelay: 10,
    })

    //#when
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(0)
  })

  test("LIVELOCK FENCE: unrelated pending task must not suppress the notification", async () => {
    //#given
    const root = join(TASK_STORE_TEST_ROOT, "unrelated-pending-task")
    mkdirSync(root, { recursive: true })
    writeTask(root, "T-22222222-2222-4222-8222-222222222222", "ses_unrelated")
    const sessionID = "ses_target"
    setMainSession(sessionID)

    const hook = createSessionNotification(createMockPluginInput(root), {
      idleConfirmationDelay: 10,
    })

    //#when
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(1)
  })

  test("should deliver the notification when the task store is missing (fail-open)", async () => {
    //#given
    const root = join(TASK_STORE_TEST_ROOT, "no-task-store")
    mkdirSync(root, { recursive: true })
    expect(existsSync(join(root, ".matrixx", "tasks"))).toBe(false)
    const sessionID = "ses_target"
    setMainSession(sessionID)

    const hook = createSessionNotification(createMockPluginInput(root), {
      idleConfirmationDelay: 10,
    })

    //#when
    await hook({
      event: {
        type: "session.idle",
        properties: { sessionID },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(1)
  })

  test("suppresses the notification for pending work in tasks.storage_path", async () => {
    //#given
    const projectRoot = makeTempDir()
    const customTaskDir = join(makeTempDir(), "custom-tasks")
    const sessionID = "ses_storage_path"
    setMainSession(sessionID)
    writeTaskInto(
      customTaskDir,
      "T-33333333-3333-4333-8333-333333333333",
      sessionID,
      projectRoot
    )
    const pluginConfig: Partial<MatrixxConfig> = {
      tasks: { enabled: true, storage_path: customTaskDir },
    }

    const hook = createSessionNotification(
      createMockPluginInput(projectRoot),
      { idleConfirmationDelay: 10 },
      pluginConfig
    )

    //#when
    await hook({
      event: { type: "session.idle", properties: { sessionID } },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(0)
  })

  test("suppresses the notification for pending work under tasks.scope global", async () => {
    //#given
    const projectRoot = makeTempDir()
    const fakeConfigDir = makeTempDir()
    const previousConfigDir = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = fakeConfigDir
    const globalTaskDir = join(fakeConfigDir, "tasks", "list-global")
    const sessionID = "ses_global_scope"
    setMainSession(sessionID)
    writeTaskInto(
      globalTaskDir,
      "T-44444444-4444-4444-8444-444444444444",
      sessionID,
      projectRoot
    )
    const pluginConfig: Partial<MatrixxConfig> = {
      tasks: { enabled: true, scope: "global", task_list_id: "list-global" },
    }

    try {
      const hook = createSessionNotification(
        createMockPluginInput(projectRoot),
        { idleConfirmationDelay: 10 },
        pluginConfig
      )

      //#when
      await hook({
        event: { type: "session.idle", properties: { sessionID } },
      })
      await new Promise((resolve) => setTimeout(resolve, 100))

      //#then
      expect(notificationCalls).toHaveLength(0)
    } finally {
      if (previousConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
      else process.env.OPENCODE_CONFIG_DIR = previousConfigDir
    }
  })

  test("still notifies when tasks.storage_path holds no pending work", async () => {
    //#given
    const projectRoot = makeTempDir()
    const emptyTaskDir = join(makeTempDir(), "empty-tasks")
    mkdirSync(emptyTaskDir, { recursive: true })
    const sessionID = "ses_empty_custom"
    setMainSession(sessionID)
    const pluginConfig: Partial<MatrixxConfig> = {
      tasks: { enabled: true, storage_path: emptyTaskDir },
    }

    const hook = createSessionNotification(
      createMockPluginInput(projectRoot),
      { idleConfirmationDelay: 10 },
      pluginConfig
    )

    //#when
    await hook({ event: { type: "session.idle", properties: { sessionID } } })
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(1)
  })

  test("fails open when the tasks.storage_path directory does not exist", async () => {
    //#given
    const projectRoot = makeTempDir()
    const missingTaskDir = join(makeTempDir(), "never-created")
    expect(existsSync(missingTaskDir)).toBe(false)
    const sessionID = "ses_missing_custom"
    setMainSession(sessionID)
    const pluginConfig: Partial<MatrixxConfig> = {
      tasks: { enabled: true, storage_path: missingTaskDir },
    }

    const hook = createSessionNotification(
      createMockPluginInput(projectRoot),
      { idleConfirmationDelay: 10 },
      pluginConfig
    )

    //#when
    await expect(
      hook({ event: { type: "session.idle", properties: { sessionID } } })
    ).resolves.toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 100))

    //#then
    expect(notificationCalls).toHaveLength(1)
  })
})
