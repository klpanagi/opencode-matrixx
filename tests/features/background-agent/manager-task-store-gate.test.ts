/// <reference types="bun-types" />
/**
 * R1a — the three background-agent completion gates (reconcile probe,
 * session.idle gate, polling gate) must read the SAME task store the user
 * configured via `tasks.storage_path` / `tasks.scope: "global"`. Before this
 * fix they passed no config, so `getTaskDir` fell back to the project
 * `.matrixx/tasks` directory, `existsSync` returned false, and the gate was a
 * total no-op: every background task completed at first idle regardless of
 * outstanding work.
 */
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { MatrixxConfig } from "../../../src/config/schema"
import { writeHandle } from "../../../src/features/background-agent/handle-index"
import { getTaskDir } from "../../../src/features/task-storage/storage"
import {
  CHILD_SESSION,
  cleanup,
  launchBackdatedTask,
  makeManager,
  makeTempDir,
  settle,
  shutdownQuietly,
  writeTask,
  type PollableManager,
} from "./manager-task-store-gate.fixtures"

describe("completion gate honours tasks.storage_path", () => {
  test("reconcile probe keeps a restored running handle alive when the configured store has open work", async () => {
    //#given a user-configured task store holding an incomplete task for the child session
    const dir = makeTempDir("matrixx-bg-gate-reconcile-")
    const custom = join(dir, "custom-tasks")
    writeTask(custom, dir)
    writeHandle(dir, {
      id: "bg_gate_reconcile",
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
    const manager = makeManager(dir, { tasks: { storage_path: custom } })

    try {
      //#when the persisted handle is reconciled against the live host
      await manager.restoreHandles()

      //#then the configured store — not the project default — is what the probe reads
      expect(getTaskDir({ tasks: { storage_path: custom } }, dir)).toBe(custom)
      expect(getTaskDir({}, dir)).not.toBe(custom)
      expect(manager.getTask("bg_gate_reconcile")?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("session.idle gate does not complete a task while the configured store has open work", async () => {
    //#given a running child task and an incomplete task in the configured store
    const dir = makeTempDir("matrixx-bg-gate-idle-")
    const custom = join(dir, "custom-tasks")
    writeTask(custom, dir)
    const manager = makeManager(dir, { tasks: { storage_path: custom } })

    try {
      const task = await launchBackdatedTask(manager)

      //#when the child session reports idle
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(150)

      //#then the gate is not a no-op: the task is still held open
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })

  test("polling gate does not complete a task while the configured store has open work", async () => {
    //#given a running child task and an incomplete task in the configured store
    const dir = makeTempDir("matrixx-bg-gate-poll-")
    const custom = join(dir, "custom-tasks")
    writeTask(custom, dir)
    const manager = makeManager(dir, { tasks: { storage_path: custom } })

    try {
      const task = await launchBackdatedTask(manager)

      //#when the polling completion gate runs
      await (manager as unknown as PollableManager).pollRunningTasks()
      await settle(50)

      //#then the gate is not a no-op: the task is still held open
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })
})

describe("completion gate honours tasks.scope: global", () => {
  test("the global store is the directory the gate reads from on both sides", async () => {
    //#given a global-scope config whose store lives under a stubbed opencode config dir
    const dir = makeTempDir("matrixx-bg-gate-global-")
    const configDir = makeTempDir("matrixx-bg-config-")
    const previousConfigDir = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = configDir
    const config: Partial<MatrixxConfig> = { tasks: { scope: "global", task_list_id: "plan-e2e" } }
    const manager = makeManager(dir, config)

    try {
      const globalStore = getTaskDir(config, dir)
      writeTask(globalStore, dir)
      const task = await launchBackdatedTask(manager)

      //#when the child session's idle gate runs against the global store
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(150)

      //#then write side and read side name one directory, and the gate is live
      expect(globalStore).toBe(join(configDir, "tasks", "plan-e2e"))
      expect(getTaskDir({}, dir)).not.toBe(globalStore)
      expect(manager.getTask(task.id)?.status).toBe("running")
    } finally {
      shutdownQuietly(manager)
      if (previousConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
      else process.env.OPENCODE_CONFIG_DIR = previousConfigDir
      cleanup(dir, configDir)
    }
  })
})

describe("completion gate without a config (negative)", () => {
  test("resolution falls back to the project .matrixx/tasks directory, unchanged", async () => {
    //#given a manager constructed without options.pluginConfig
    const dir = makeTempDir("matrixx-bg-gate-default-")
    const manager = makeManager(dir)

    try {
      //#when the child session's idle gate runs
      const task = await launchBackdatedTask(manager)
      manager.handleEvent({ type: "session.idle", properties: { sessionID: CHILD_SESSION } })
      await settle(150)

      //#then the default project store is used and, with no open work, the task completes
      expect(getTaskDir({}, dir)).toBe(join(dir, ".matrixx", "tasks"))
      expect(manager.getTask(task.id)?.status).toBe("completed")
    } finally {
      shutdownQuietly(manager)
      cleanup(dir)
    }
  })
})
