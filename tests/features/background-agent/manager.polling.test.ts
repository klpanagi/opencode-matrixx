import { describe, expect, mock, spyOn, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { _resetPruneThrottleForTesting, BackgroundManager } from "../../../src/features/background-agent/manager"
import type { BackgroundTask } from "../../../src/features/background-agent/types"

function createManagerWithStatus(statusImpl: () => Promise<{ data: Record<string, { type: string }> }>): BackgroundManager {
  const client = {
    session: {
      status: statusImpl,
      prompt: async () => ({}),
      promptAsync: async () => ({}),
      abort: async () => ({}),
      todo: async () => ({ data: [] }),
      messages: async () => ({ data: [] }),
    },
  }

  return new BackgroundManager({ client, directory: tmpdir() } as unknown as PluginInput)
}

describe("BackgroundManager polling overlap", () => {
  test("skips overlapping pollRunningTasks executions", async () => {
    //#given
    let activeCalls = 0
    let maxActiveCalls = 0
    let statusCallCount = 0
    let releaseStatus: (() => void) | undefined
    const statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve
    })

    const manager = createManagerWithStatus(async () => {
      statusCallCount += 1
      activeCalls += 1
      maxActiveCalls = Math.max(maxActiveCalls, activeCalls)
      await statusGate
      activeCalls -= 1
      return { data: {} }
    })

    //#when
    const firstPoll = (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks()
    await Promise.resolve()
    const secondPoll = (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks()
    releaseStatus?.()
    await Promise.all([firstPoll, secondPoll])
    manager.shutdown()

    //#then
    expect(maxActiveCalls).toBe(1)
    expect(statusCallCount).toBe(1)
  })

  test("checkAndInterruptStaleTasks called once per poll", async () => {
    //#given
    const manager = createManagerWithStatus(async () => ({ data: {} }))

    const spy = mock(async (_statuses: unknown) => {})
    ;(manager as unknown as { checkAndInterruptStaleTasks: (s: unknown) => Promise<void> }).checkAndInterruptStaleTasks =
      spy
    ;(manager as unknown as { pruneStaleTasksAndNotifications: () => void }).pruneStaleTasksAndNotifications = () => {}

    //#when
    await (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks()

    //#then
    expect(spy.mock.calls.length).toBe(1)

    manager.shutdown()
  })

  test("pollingInFlight atomic under concurrent ticks", async () => {
    //#given
    // Race-condition regression test: 10 concurrent pollRunningTasks() invocations
    // must result in exactly ONE body execution. The atomic check-and-set at
    // manager.ts:1639-1640 is synchronous (no `await` between check and set),
    // so the first call wins the pollingInFlight flag synchronously. The other
    // 9 see it as true in their sync prologue and return early at line 1639.
    // We spy on pruneStaleTasksAndNotifications (first call inside the try
    // block at line 1642) to count body executions. If a future refactor moved
    // `pollingInFlight = true` into the try block, or removed the finally
    // reset, this test would observe > 1 call.
    const manager = createManagerWithStatus(async () => ({ data: {} }))

    const pruneSpy = spyOn(
      manager as unknown as { pruneStaleTasksAndNotifications: () => void },
      "pruneStaleTasksAndNotifications"
    )
    pruneSpy.mockImplementation(() => {})

    //#when
    const concurrentCalls = Array.from({ length: 10 }, () =>
      (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks()
    )
    await Promise.all(concurrentCalls)

    //#then
    expect(pruneSpy.mock.calls.length).toBe(1)

    pruneSpy.mockRestore()
    manager.shutdown()
  })

  test("pruneStaleTasksAndNotifications throttled to 30s", async () => {
    //#given
    // Throttle test: pollRunningTasks() fires every 3s (POLLING_INTERVAL_MS),
    // but pruneStaleTasksAndNotifications only needs to run every 30s — stale
    // tasks age out at TASK_TTL_MS (30 minutes), so 30s is 60× the minimum
    // useful frequency. Throttle lives INSIDE pollRunningTasks (not in prune
    // itself) so the function stays pure. We make 10 SEQUENTIAL awaited calls
    // so each one enters the body — the B5 test uses concurrent calls which
    // are blocked by the pollingInFlight guard. The first call updates
    // lastPruneAt; the 9 subsequent calls see the throttle active and skip.
    _resetPruneThrottleForTesting()
    const manager = createManagerWithStatus(async () => ({ data: {} }))

    const pruneSpy = spyOn(
      manager as unknown as { pruneStaleTasksAndNotifications: () => void },
      "pruneStaleTasksAndNotifications"
    )
    pruneSpy.mockImplementation(() => {})

    const poll = (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks.bind(manager)

    //#when
    for (let i = 0; i < 10; i++) {
      await poll()
    }

    //#then
    expect(pruneSpy.mock.calls.length).toBe(1)

    pruneSpy.mockRestore()
    manager.shutdown()
  })
})

// ---------------------------------------------------------------------------
// Completion gate scoping: the gate must consult the file-backed task store,
// scoped to the CHILD session, and must not be held open by unrelated work.
//
// Every test below stubs `client.session.todo()` to report one INCOMPLETE legacy
// todo. That is deliberate: the only thing allowed to unblock completion is the
// new task-store predicate, so a test cannot pass merely because the old todo
// read happened to return an empty list. It also models the real defect — legacy
// todo state is per-session and persists, so a stale entry would hold the task
// open forever.
// ---------------------------------------------------------------------------

interface T5Harness {
  manager: BackgroundManager
  directory: string
  task: BackgroundTask
}

const SEED_UUID = "11111111-2222-3333-4444-555555555555"

function createCompletionHarness(): T5Harness {
  const directory = mkdtempSync(join(tmpdir(), "bg-task5-"))
  const client = {
    session: {
      status: async () => ({ data: {} as Record<string, { type: string }> }),
      prompt: async () => ({}),
      promptAsync: async () => ({}),
      abort: async () => ({}),
      todo: async () => ({
        data: [{ content: "stale legacy entry", status: "pending", priority: "high", id: "todo-legacy" }],
      }),
      messages: async () => ({ data: [] }),
    },
  }
  const manager = new BackgroundManager({ client, directory } as unknown as PluginInput)

  const task: BackgroundTask = {
    id: "bg-1",
    sessionID: "ses_child",
    parentSessionID: "ses_parent",
    parentMessageID: "msg-1",
    description: "worker",
    prompt: "work",
    agent: "build",
    status: "running",
    queuedAt: new Date(Date.now() - 60_000),
    startedAt: new Date(Date.now() - 30_000),
  }
  ;(manager as unknown as { tasks: Map<string, BackgroundTask> }).tasks.set(task.id, task)
  ;(manager as unknown as { validateSessionHasOutput: (id: string) => Promise<boolean> }).validateSessionHasOutput =
    async () => true

  return { manager, directory, task }
}

function writeStoreTask(directory: string, id: string, threadID: string): void {
  const taskDir = join(directory, ".matrixx", "tasks")
  mkdirSync(taskDir, { recursive: true })
  writeFileSync(
    join(taskDir, `T-${id}.json`),
    JSON.stringify({
      id: `T-${id}`,
      subject: `store task ${id}`,
      description: "written by the test",
      status: "pending",
      blocks: [],
      blockedBy: [],
      threadID,
    })
  )
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe("BackgroundManager completion gate scoping", () => {
  test("LIVELOCK: an unrelated project task does not hold a child session open", async () => {
    //#given
    const { manager, directory, task } = createCompletionHarness()
    writeStoreTask(directory, SEED_UUID, "ses_unrelated")

    //#when
    manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_child" } })
    await waitFor(() => task.status !== "running")

    //#then
    expect(task.status).toBe("completed")

    rmSync(directory, { recursive: true, force: true })
    manager.shutdown()
  })

  test("the worker's own pending task does hold completion", async () => {
    //#given
    const { manager, directory, task } = createCompletionHarness()
    writeStoreTask(directory, SEED_UUID, "ses_child")

    //#when
    manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_child" } })
    await new Promise((resolve) => setTimeout(resolve, 150))

    //#then
    expect(task.status).toBe("running")

    rmSync(directory, { recursive: true, force: true })
    manager.shutdown()
  })

  test("the polling path obeys the identical predicate", async () => {
    //#given
    const { manager, directory, task } = createCompletionHarness()
    writeStoreTask(directory, SEED_UUID, "ses_unrelated")
    ;(manager as unknown as { checkAndInterruptStaleTasks: (s: unknown) => Promise<void> }).checkAndInterruptStaleTasks =
      async () => {}
    ;(manager as unknown as { pruneStaleTasksAndNotifications: () => void }).pruneStaleTasksAndNotifications = () => {}
    const completeSpy = mock(async (_task: BackgroundTask, _source: string) => true)
    ;(manager as unknown as { tryCompleteTask: (t: BackgroundTask, s: string) => Promise<boolean> }).tryCompleteTask =
      completeSpy
    ;(manager as unknown as { client: { session: { status: () => Promise<unknown> } } }).client.session.status = async () => ({
      data: { ses_child: { type: "idle" } },
    })

    //#when
    await (manager as unknown as { pollRunningTasks: () => Promise<void> }).pollRunningTasks()

    //#then
    expect(completeSpy.mock.calls.length).toBe(1)
    expect(task.status).toBe("running")

    rmSync(directory, { recursive: true, force: true })
    manager.shutdown()
  })

  test("an absent task store lets completion proceed (fail-open)", async () => {
    //#given
    const { manager, directory, task } = createCompletionHarness()
    // No `.matrixx/tasks` directory is created at all.

    //#when
    manager.handleEvent({ type: "session.idle", properties: { sessionID: "ses_child" } })
    await waitFor(() => task.status !== "running")

    //#then
    expect(task.status).toBe("completed")

    rmSync(directory, { recursive: true, force: true })
    manager.shutdown()
  })
})
