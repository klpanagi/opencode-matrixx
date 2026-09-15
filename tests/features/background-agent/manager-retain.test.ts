/**
 * Retention-invariant proof — Tier-2 Revive foundation.
 *
 * Audit table (manager.ts):
 *
 *   terminateQueuedTask ........ persistHandle: YES (line 486)
 *   startTask  promptAsync err .. persistHandle: YES (line 673)
 *   resume     promptAsync err .. persistHandle: YES (line 941)
 *   resume     status=restart ... persistHandle: YES (line 872)
 *   cancelTask ................ persistHandle: YES (line 1332)
 *   tryCompleteTask ........... persistHandle: YES (line 1501)
 *   pruneStale pending ........ persistHandle: YES (line 1683)
 *   pruneStale  running ....... persistHandle: YES (line 1819)
 *   staleCheck no-progress .... persistHandle: YES (line 1787)
 *   staleCheck  no-update ..... persistHandle: YES (line 1819)
 *   reconcileRestoredTask ..... persistHandle: YES (line 260)
 *   processKey queued cancel .. persistHandle: YES (line 381)
 *   admitNested reserve cancel. persistHandle: YES (line 452)
 *   admitNested depth exceeded. via terminateQueuedTask→line 486
 *   launch trackTask .......... persistHandle: YES (line 812)
 *   status=re (startTask) ..... persistHandle: YES (line 608)
 *   status=r (resume) ......... persistHandle: YES (line 872)
 *
 * Total `.status = "` hits: 17 → every terminal-path resolves to a persisting branch: YES.
 * No genuine gap found — this test is test-only (ZERO production patches).
 */

/// <reference types="bun-types" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test"

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import { _resetPruneThrottleForTesting } from "../../../src/features/background-agent/manager"
import { writeHandle, readHandles } from "../../../src/features/background-agent/handle-index"
import { initTaskToastManager } from "../../../src/features/task-toast-manager/manager"
import { _resetTaskToastManagerForTesting } from "../../../src/features/task-toast-manager/manager"
import { _resetMessageDirCacheForTesting } from "../../../src/features/background-agent/message-dir"
import { registerSubagentSession, subagentSessions } from "../../../src/features/session-state"
import { BG_HANDLE_DIR_NAME } from "../../../src/features/background-agent/handle-index"

// ── helpers ────────────────────────────────────────────────────────────

const TMP_ROOT = mkdtempSync(join(tmpdir(), "retain-"))

interface MockClient {
  session: {
    get: () => Promise<{ data?: { directory: string } }>
    create: () => Promise<{ error?: string; data?: { id: string } }>
    promptAsync: () => Promise<void>
    promptAsyncRaw: (body: Record<string, unknown>) => Promise<void>
    status: () => Promise<Record<string, { type: string }>>
    todo: () => Promise<{ data?: unknown[] }>
    messages: () => Promise<{ data?: unknown[] }>
    abort: () => Promise<void>
  }
}

function makeMockClient(overrides?: {
  createError?: string
  promptReject?: Error
  sessionStatuses?: Record<string, { type: string }>
}): MockClient {
  const statuses: Record<string, { type: string }> = overrides?.sessionStatuses ?? {}
  return {
    session: {
      get: async () => ({ data: { directory: TMP_ROOT } }),
      create: async () =>
        overrides?.createError
          ? { error: overrides.createError }
          : { data: { id: `sess_${Math.random().toString(36).slice(2, 10)}` } },
      promptAsync: overrides?.promptReject
        ? () => { throw overrides.promptReject! }
        : async () => {},
      promptAsyncRaw: overrides?.promptReject
        ? () => { throw overrides.promptReject! }
        : async () => {},
      status: async () => statuses,
      todo: async () => ({ data: [] }),
      messages: async () => ({ data: [] }),
      abort: async () => {},
    },
  }
}

function buildManager(ctx: MockClient): BackgroundManager {
  const toastMgr = initTaskToastManager(ctx.session)
  const mgr = new BackgroundManager(
    {
      client: ctx,
      directory: TMP_ROOT,
      getAgentToolRestrictions: () => ({}),
      llm: { chat: async () => ({ content: "" }) },
      directoryConfig: {},
    } as never,
  )
  mgr["taskToastManager"] = toastMgr as never
  return mgr
}

// ── tests ──────────────────────────────────────────────────────────────

describe("Retention invariant", () => {
  beforeEach(() => {
    _resetPruneThrottleForTesting()
    _resetTaskToastManagerForTesting()
    _resetMessageDirCacheForTesting()
    // Reset shared state
    subagentSessions.clear()
  })

  afterEach(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true })
    } catch { /* best-effort */ }
  })

  describe("cancel — terminal status persists to disk", () => {
    test("cancelling a running task writes a handle with status cancelled and sessionID intact", async () => {
      //#given
      const ctx = makeMockClient()
      const mgr = buildManager(ctx)

      const task: BackgroundTask = {
        id: "bg_abc12345",
        status: "running",
        sessionID: "sess_parent001",
        parentSessionID: "sess_parent001",
        parentMessageID: "msg_ref_1",
        description: "test cancel task",
        prompt: "do stuff",
        agent: "oracle",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      }
      mgr["tasks"].set(task.id, task)

      const dir = join(TMP_ROOT, ".matrixx", BG_HANDLE_DIR_NAME)
      mkdirSync(dir, { recursive: true })
      writeHandle(dir, task)

      //#when
      const result = await mgr.cancelTask(task.id)

      //#then
      expect(result).toBe(true)
      const filePath = join(dir, `${task.id}.json`)
      expect(existsSync(filePath)).toBe(true)
      const raw = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(raw.status).toBe("cancelled")
      expect(raw.sessionID).toBe("sess_parent001")
    })

    test("cancelling a pending task writes a handle with status cancelled", async () => {
      //#given
      const ctx = makeMockClient()
      const mgr = buildManager(ctx)

      const task: BackgroundTask = {
        id: "bg_pending01",
        status: "pending",
        parentSessionID: "sess_pend01",
        parentMessageID: "msg_ref_2",
        description: "pending cancel",
        prompt: "wait",
        agent: "oracle",
        queuedAt: new Date("2026-01-01T00:00:00Z"),
      }
      mgr["tasks"].set(task.id, task)

      const dir = join(TMP_ROOT, ".matrixx", BG_HANDLE_DIR_NAME)
      mkdirSync(dir, { recursive: true })
      writeHandle(dir, task)

      //#when
      await mgr.cancelTask(task.id)

      //#then
      const filePath = join(dir, `${task.id}.json`)
      const raw = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(raw.status).toBe("cancelled")
    })
  })

  describe("complete — terminal completion persists to disk", () => {
    test("a task reaching completion writes a handle with status completed", async () => {
      //#given
      const ctx = makeMockClient()
      const mgr = buildManager(ctx)

      const task: BackgroundTask = {
        id: "bg_comp001",
        status: "running",
        sessionID: "sess_comp001",
        parentSessionID: "sess_parent_comp",
        parentMessageID: "msg_ref_c",
        description: "complete task",
        prompt: "finish",
        agent: "oracle",
        startedAt: new Date("2026-01-01T00:00:00Z"),
      }
      mgr["tasks"].set(task.id, task)

      const dir = join(TMP_ROOT, ".matrixx", BG_HANDLE_DIR_NAME)
      mkdirSync(dir, { recursive: true })
      writeHandle(dir, task)

      // Access private method via bracket notation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tryComplete = (mgr as any).tryCompleteTask.bind(mgr)

      //#when
      await tryComplete(task, "direct-test")

      //#then
      const filePath = join(dir, `${task.id}.json`)
      const raw = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(raw.status).toBe("completed")
      expect(typeof raw.completedAt).toBe("number")
    })
  })

  describe("prune — stale removal keeps handle on disk", () => {
    test("pruning a stale running task deletes from memory but handle remains with terminal error status", async () => {
      //#given
      const ctx = makeMockClient({
        sessionStatuses: { "sess_prune01": { type: "idle" } },
      })
      const mgr = buildManager(ctx)

      // Fast-forward time so TASK_TTL_MS has passed
      const past = Date.now() - 60 * 60 * 1000 // 1 hour ago

      const task: BackgroundTask = {
        id: "bg_prune01",
        status: "running",
        sessionID: "sess_prune01",
        parentSessionID: "sess_parent_prune",
        parentMessageID: "msg_ref_p",
        description: "stale prune task",
        prompt: "run long",
        agent: "oracle",
        startedAt: new Date(past),
      }
      mgr["tasks"].set(task.id, task)

      const dir = join(TMP_ROOT, ".matrixx", BG_HANDLE_DIR_NAME)
      mkdirSync(dir, { recursive: true })
      writeHandle(dir, task)

      // Disarm prune throttle so prune runs immediately
      ;(mgr as unknown as { lastPruneAt: number }).lastPruneAt = 0

      //#when
      // Invoke prune directly (private, accessed via bracket)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mgr as any).pruneStaleTasksAndNotifications()

      //#then — task removed from in-memory map
      expect(mgr["tasks"].has(task.id)).toBe(false)

      // Handle file still on disk with terminal error status
      const filePath = join(dir, `${task.id}.json`)
      const raw = JSON.parse(readFileSync(filePath, "utf-8"))
      expect(raw.status).toBe("error")
      expect(typeof raw.completedAt).toBe("number")

      // Re-read via readHandles proves persistence survives
      const handles = readHandles(TMP_ROOT)
      expect(handles.length).toBeGreaterThanOrEqual(1)
      const reap = handles.find((h) => h.taskId === task.id)
      expect(reap).toBeDefined()
      expect(reap!.status).toBe("error")
      expect(reap!.terminalReason).toBe(undefined)
    })
  })
})
