/// <reference types="bun-types" />
import { beforeEach, describe, expect, mock, test } from "bun:test"

// Mock module-level imports before importing the unit under test
const mockUnregisterSubagentSession = mock(() => {})
const mockRegisterSubagentSession = mock(() => {})

mock.module("../../../src/features/session-state", () => ({
  registerSubagentSession: mockRegisterSubagentSession,
  unregisterSubagentSession: mockUnregisterSubagentSession,
}))

mock.module("../../../src/features/task-toast-manager", () => ({
  getTaskToastManager: mock(() => null),
}))

mock.module("../../../src/features/tool-metadata-store", () => ({
  storeToolMetadata: mock(() => {}),
}))

mock.module("../../../src/shared/logger", () => ({
  log: mock(() => {}),
}))

import type { ExecutorContext, ParentContext } from "../../../src/tools/delegate-task/executor-types"
// Import after mocks
import { executeSyncTask } from "../../../src/tools/delegate-task/sync-task"
import type { SyncTaskDeps } from "../../../src/tools/delegate-task/sync-task-deps"
import type { DelegateTaskArgs, ToolContextWithMetadata } from "../../../src/tools/delegate-task/types"

// --- Helpers ---

const SESSION_ID = "test-session-abc"
const TIMEOUT_ERROR = `Poll timeout reached after 600000ms for session ${SESSION_ID}`

const defaultArgs: DelegateTaskArgs = {
  description: "test task",
  prompt: "do something",
  run_in_background: false,
  load_skills: [],
}

function buildMockContext() {
  const mockAbort = mock(() => Promise.resolve())
  const client = {
    session: {
      abort: mockAbort,
      status: mock(() => Promise.resolve({})),
      messages: mock(() => Promise.resolve({})),
    },
    config: { get: mock(() => Promise.resolve({})) },
  }

  const ctx = {
    sessionID: "parent-session",
    callID: "call-1",
    metadata: mock(() => Promise.resolve()),
    abort: {},
  } as unknown as ToolContextWithMetadata

  const executorCtx = {
    client,
    directory: "/tmp",
    manager: {
      getTasksByParentSession: mock(() => []),
      hasInFlightNotificationForParent: mock(() => false),
    },
    onSyncSessionCreated: undefined,
  } as unknown as ExecutorContext

  const parentContext = {
    sessionID: "parent-session",
    messageID: "msg-1",
  } as ParentContext

  return { ctx, executorCtx, parentContext, mockAbort, client }
}

function createMockDeps(
  pollResult: string | null,
  fetchResult: { ok: true; textContent: string } | { ok: false; error: string } = {
    ok: true as const,
    textContent: "completed",
  },
): SyncTaskDeps {
  return {
    createSyncSession: mock(() =>
      Promise.resolve({ ok: true as const, sessionID: SESSION_ID, parentDirectory: "/tmp" }),
    ),
    sendSyncPrompt: mock(() => Promise.resolve(null)),
    pollSyncSession: mock(() => Promise.resolve(pollResult)),
    fetchSyncResult: mock(() => Promise.resolve(fetchResult)),
  }
}

// --- Tests ---

describe("executeSyncTask — no-abort-on-timeout", () => {
  let ctx: ToolContextWithMetadata
  let executorCtx: ExecutorContext
  let parentContext: ParentContext
  let mockAbort: ReturnType<typeof mock>

  beforeEach(() => {
    const built = buildMockContext()
    ctx = built.ctx
    executorCtx = built.executorCtx
    parentContext = built.parentContext
    mockAbort = built.mockAbort
    mockRegisterSubagentSession.mockClear()
    mockUnregisterSubagentSession.mockClear()
    mockAbort.mockClear()
  })

  describe("timeout path", () => {
    test("does NOT call abort when poll times out", async () => {
      //#given — poll returns the real timeout string contract
      const deps = createMockDeps(TIMEOUT_ERROR)

      //#when
      const result = await executeSyncTask(
        defaultArgs,
        ctx,
        executorCtx,
        parentContext,
        "mouse",
        undefined,
        undefined,
        undefined,
        deps,
      )

      //#then
      expect(typeof result).toBe("string")
      expect(mockAbort).not.toHaveBeenCalled()
      expect(mockUnregisterSubagentSession).toHaveBeenCalledWith(SESSION_ID)
    })

    test("returns session ID in result on timeout for resume", async () => {
      //#given
      const deps = createMockDeps(TIMEOUT_ERROR)

      //#when
      const result = await executeSyncTask(
        defaultArgs,
        ctx,
        executorCtx,
        parentContext,
        "mouse",
        undefined,
        undefined,
        undefined,
        deps,
      )

      //#then — result must contain the session ID for resume
      expect(result).toContain(SESSION_ID)
      expect(result).toContain("Poll timeout reached")
    })
  })

  describe("success path", () => {
    test("calls abort when poll succeeds", async () => {
      //#given
      const deps = createMockDeps(
        null,
        { ok: true as const, textContent: "task completed successfully" },
      )

      //#when
      const result = await executeSyncTask(
        defaultArgs,
        ctx,
        executorCtx,
        parentContext,
        "mouse",
        undefined,
        undefined,
        undefined,
        deps,
      )

      //#then
      expect(mockAbort).toHaveBeenCalledTimes(1)
      expect(mockAbort).toHaveBeenCalledWith({ path: { id: SESSION_ID } })
      expect(result).toContain("task completed successfully")
    })
  })

  describe("non-timeout error path", () => {
    test("calls abort on stall error (preserves existing behavior)", async () => {
      //#given — poll returns stall error as string (current contract)
      const deps = createMockDeps("Session stalled: no assistant response")

      //#when
      const result = await executeSyncTask(
        defaultArgs,
        ctx,
        executorCtx,
        parentContext,
        "mouse",
        undefined,
        undefined,
        undefined,
        deps,
      )

      //#then — abort IS called for non-timeout errors
      expect(mockAbort).toHaveBeenCalledTimes(1)
      expect(mockAbort).toHaveBeenCalledWith({ path: { id: "test-session-abc" } })
      expect(result).toContain("Session stalled")
    })
  })
})
