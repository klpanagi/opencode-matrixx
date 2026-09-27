/// <reference types="bun-types" />
/**
 * A1 (D4) — the background completion gate must use the BACKGROUND staleness
 * window (`tasks.background_stale_after_hours`, default 2h), not the
 * continuation enforcer's 24h.
 *
 * The two windows have different failure costs. A missed enforcer nudge is
 * cheap; a background handle held `running` by a task its crashed worker
 * never completed wedges a concurrency slot. Before this fix the gate fell
 * through to `getStaleAfterMs`, so an orphaned task blocked completion for up
 * to 24h of file-mtime age.
 */
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { writeHandle } from "../../../src/features/background-agent/handle-index"
import { getStaleAfterMs } from "../../../src/hooks/task-continuation-enforcer/staleness"
import { readSessionTasks } from "../../../src/features/task-session-scope"
import {
  CHILD_SESSION,
  cleanup,
  launchBackdatedTask,
  makeManager,
  makeTempDir,
  settle,
  shutdownQuietly,
  waitFor,
  writeAgedTask,
  type PollableManager,
} from "./manager-task-store-gate.fixtures"

const HOUR_MS = 60 * 60 * 1000

describe("background completion gate uses the 2h background window (session.idle)", () => {
  test("a 3-hour-orphaned in_progress task no longer holds the handle running", async () => {
    //#given a running child handle whose only task file has been untouched for 3h
    //     — past the 2h background window, well inside the enforcer's 24h
    const dir = makeTempDir("matrixx-bg-stale-3h-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then the 2h window treats the orphaned task as stale and the handle completes
      expect(manager.getTask(task.id)?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("a 1-hour-old task still holds the handle running (the window did not become 'everything is stale')", async () => {
    //#given a running child handle whose task file is only 1h old
    const dir = makeTempDir("matrixx-bg-stale-1h-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 1 * HOUR_MS)
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then 1h is inside the 2h window, so pending work is still respected
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("a FRESH in_progress task keeps the handle running (the load-bearing positive case)", async () => {
    //#given a running child handle whose task file was just written
    const dir = makeTempDir("matrixx-bg-stale-fresh-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 0)
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then the gate is still live — without this, the tests above pass vacuously
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("an explicit tasks.background_stale_after_hours of 8 keeps a 3-hour-old task pending", async () => {
    //#given the same 3h-orphaned task but a user-configured 8h background window
    const dir = makeTempDir("matrixx-bg-stale-8h-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)
    const manager = makeManager(dir, { tasks: { background_stale_after_hours: 8 } })

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then the key is read, not hardcoded to 2 — 3h is inside 8h
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })
})

describe("background completion gate uses the 2h background window (polling + reconcile)", () => {
  test("the polling gate also drops a 3-hour-orphaned task", async () => {
    //#given a running child handle and a 3h-old task in the project store
    const dir = makeTempDir("matrixx-bg-stale-poll-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the polling completion gate runs
      await (manager as unknown as PollableManager).pollRunningTasks()
      await settle(50)

      //#then the second gate site applies the same window, not the 24h one
      expect(manager.getTask(task.id)?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("the polling gate still holds a fresh task open", async () => {
    //#given a running child handle and a freshly written task
    const dir = makeTempDir("matrixx-bg-stale-poll-fresh-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 0)
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the polling completion gate runs
      await (manager as unknown as PollableManager).pollRunningTasks()
      await settle(50)

      //#then the gate is live on the polling path too
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("the reconcile probe does not resurrect a handle held by a 3-hour-orphaned task", async () => {
    //#given a persisted running handle whose session's only task is 3h old
    const dir = makeTempDir("matrixx-bg-stale-reconcile-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)
    writeHandle(dir, {
      id: "bg_stale_reconcile",
      status: "running",
      sessionID: CHILD_SESSION,
      parentSessionID: "ses_parent",
      parentMessageID: "msg_parent",
      description: "reconcilable task",
      prompt: "old prompt",
      agent: "oracle",
      queuedAt: new Date(),
      startedAt: new Date(Date.now() - 60_000),
    })
    const manager = makeManager(dir)

    try {
      //#when the persisted handle is reconciled against the live host
      await manager.restoreHandles()

      //#then the injected probe uses the 2h window, so the orphan no longer re-classifies it running
      await waitFor(() => manager.getTask("bg_stale_reconcile")?.status !== "running")
      expect(manager.getTask("bg_stale_reconcile")?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })
})

describe("anti-livelock: a shorter window must not widen what holds a handle", () => {
  test("a fresh task belonging to ANOTHER session does not hold this handle open", async () => {
    //#given a running child handle and a fresh open task owned by an unrelated session
    const dir = makeTempDir("matrixx-bg-stale-foreign-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 0, {
      id: "T-foreign-0000-4000-8000-000000000003",
      threadID: "ses_someone_else",
    })
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then a foreign session's work still never blocks this handle
      expect(manager.getTask(task.id)?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("a 1-hour-old task from another session does not hold this handle open either", async () => {
    //#given a 1h-old open task owned by an unrelated session
    const dir = makeTempDir("matrixx-bg-stale-foreign-aged-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 1 * HOUR_MS, {
      id: "T-foreign-aged-0000-4000-8000-000000000004",
      threadID: "ses_someone_else",
    })
    const manager = makeManager(dir)

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(200)

      //#then session scoping, not the window, is what excludes it
      expect(manager.getTask(task.id)?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })
})

describe("the continuation enforcer's own window is untouched", () => {
  test("a 3-hour-old task is still fresh for a readSessionTasks query with no override", async () => {
    //#given a 3h-old task — stale for the background gate, fresh for the enforcer
    const dir = makeTempDir("matrixx-bg-stale-enforcer-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)

    //#when the enforcer-style read runs (no staleAfterMs override)
    const tasks = readSessionTasks({ directory: dir, sessionID: CHILD_SESSION })

    //#then the enforcer still uses 24h and still sees the task
    expect(getStaleAfterMs()).toBe(24 * HOUR_MS)
    expect(tasks).toHaveLength(1)
  })

  test("the same task IS dropped once the background window is passed as an override", async () => {
    //#given the same 3h-old task
    const dir = makeTempDir("matrixx-bg-stale-enforcer-override-")
    writeAgedTask(join(dir, ".matrixx", "tasks"), dir, 3 * HOUR_MS)

    //#when the identical read passes the 2h background window
    const tasks = readSessionTasks({ directory: dir, sessionID: CHILD_SESSION, staleAfterMs: 2 * HOUR_MS })

    //#then the override — and only the override — changes the outcome
    expect(tasks).toHaveLength(0)
  })
})
