/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import { readHandles, writeHandle } from "../../../src/features/background-agent/handle-index"
import { _resetForTesting, registerSubagentSession } from "../../../src/features/session-state"

let TMP_DIR = ""

const FAST_ADMISSION_TIMEOUT_MS = 50
const AGENT = "oracle"

interface PromptCall {
  path: { id: string }
  body: { parts?: Array<{ type: string; text: string }>; [key: string]: unknown }
}

function makeClient() {
  const promptCalls: PromptCall[] = []
  let counter = 0
  const client = {
    session: {
      get: async () => ({ data: { directory: TMP_DIR } }),
      create: async () => ({ data: { id: `sess_new_${++counter}` } }),
      promptAsync: async (args: PromptCall) => {
        promptCalls.push(args)
        return {}
      },
      abort: async () => ({}),
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [] }),
      status: async () => ({}),
    },
  }
  return { client, promptCalls }
}

function makeManager(client: unknown, dir: string, config?: unknown): BackgroundManager {
  return new BackgroundManager({ client, directory: dir } as never, config as never)
}

function seedTask(id: string, sessionID: string | undefined, status: BackgroundTask["status"]): BackgroundTask {
  const task: BackgroundTask = {
    id,
    status,
    sessionID,
    parentSessionID: "sess_parent",
    parentMessageID: "msg_parent",
    description: `task ${id}`,
    prompt: "old prompt",
    agent: AGENT,
    queuedAt: new Date("2026-01-01T00:00:00Z"),
    startedAt: new Date("2026-01-01T00:01:00Z"),
    completedAt: new Date("2026-01-01T00:02:00Z"),
  }
  writeHandle(TMP_DIR, task)
  return task
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("waitFor timed out")
}

async function occupyOnlySlot(mgr: BackgroundManager): Promise<BackgroundTask> {
  const holder = await mgr.launch({
    description: "slot holder",
    prompt: "hold",
    agent: AGENT,
    parentSessionID: "sess_parent",
    parentMessageID: "msg_parent",
  })
  await waitFor(() => mgr.getTask(holder.id)?.status === "running")
  return holder
}

function handleFor(taskId: string) {
  return readHandles(TMP_DIR).find((handle) => handle.taskId === taskId)
}

describe("BackgroundManager.revive admission", () => {
  beforeEach(() => {
    TMP_DIR = mkdtempSync(join(tmpdir(), "revive-admission-"))
    _resetForTesting()
  })

  afterEach(() => {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  test("(1) a saturated root revive is denied as queue-saturated and leaves the holder untouched", async () => {
    //#given a queue limited to one slot, already held by a running root task
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { defaultConcurrency: 1, admissionTimeoutMs: FAST_ADMISSION_TIMEOUT_MS })
    const holder = await occupyOnlySlot(mgr)
    const seeded = seedTask("bg_root_sat", "sess_root_sat", "completed")

    //#when a root revive is attempted on the same key
    const revive = mgr.revive({
      taskId: seeded.id,
      prompt: "revive please",
      parentSessionID: "sess_parent",
      parentMessageID: "msg_new",
    })

    //#then it is bounded by admissionTimeoutMs and reported truthfully
    await expect(revive).rejects.toThrow(/Queue admission timed out/)
    const persisted = handleFor(seeded.id)
    expect(persisted?.status).toBe("stopped")
    expect(persisted?.terminalReason).toBe("queue-saturated")

    //#and the holder was never disturbed
    expect(mgr.getTask(holder.id)?.status).toBe("running")
    mgr.shutdown()
  })

  test("(2) a nested revive bypasses admission entirely and never blocks", async () => {
    //#given a saturated queue AND a requester that is itself a managed subagent
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { defaultConcurrency: 1, admissionTimeoutMs: FAST_ADMISSION_TIMEOUT_MS })
    const holder = await occupyOnlySlot(mgr)
    registerSubagentSession("sess_nested_child", "sess_parent")
    const seeded = seedTask("bg_nested_ok", "sess_nested_ok", "completed")

    //#when a nested revive is attempted
    const revived = await Promise.race([
      mgr.revive({
        taskId: seeded.id,
        prompt: "nested revive",
        parentSessionID: "sess_nested_child",
        parentMessageID: "msg_new",
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("nested revive blocked")), 1500)),
    ])

    //#then it is admitted without waiting on the semaphore
    expect((revived as BackgroundTask).status).toBe("running")
    expect((revived as BackgroundTask).concurrencyKey).toBeUndefined()
    expect(mgr.getTask(holder.id)?.status).toBe("running")
    mgr.shutdown()
  })

  test("(3) exceeding the nested bypass cap yields nested-depth-exceeded", async () => {
    //#given maxDepth nested bypass admissions already active on the same key
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { nestedAdmission: { enabled: true, mode: "bypass", maxDepth: 2 } })
    registerSubagentSession("sess_nested_child", "sess_parent")

    for (const id of ["bg_cap_1", "bg_cap_2"]) {
      seedTask(id, `sess_${id}`, "completed")
      const admitted = await mgr.revive({
        taskId: id,
        prompt: "fill the cap",
        parentSessionID: "sess_nested_child",
        parentMessageID: "msg_new",
      })
      expect(admitted.status).toBe("running")
    }

    //#when one more nested revive is attempted
    const seeded = seedTask("bg_cap_3", "sess_bg_cap_3", "completed")
    const overflow = mgr.revive({
      taskId: seeded.id,
      prompt: "over the cap",
      parentSessionID: "sess_nested_child",
      parentMessageID: "msg_new",
    })

    //#then it is terminated at the depth cap, not silently admitted
    await expect(overflow).rejects.toThrow(/Nested admission depth exceeded/)
    const persisted = handleFor(seeded.id)
    expect(persisted?.status).toBe("stopped")
    expect(persisted?.terminalReason).toBe("nested-depth-exceeded")
    mgr.shutdown()
  })

  test("(4) completing bypass tasks releases the counter so a later nested revive succeeds", async () => {
    //#given the bypass cap has been filled and then drained
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { nestedAdmission: { enabled: true, mode: "bypass", maxDepth: 2 } })
    registerSubagentSession("sess_nested_child", "sess_parent")

    for (const id of ["bg_drain_1", "bg_drain_2"]) {
      seedTask(id, `sess_${id}`, "completed")
      await mgr.revive({
        taskId: id,
        prompt: "fill",
        parentSessionID: "sess_nested_child",
        parentMessageID: "msg_new",
      })
      await mgr.cancelTask(id, { abortSession: false, skipNotification: true })
    }

    //#when a fresh nested revive arrives
    const seeded = seedTask("bg_drain_3", "sess_bg_drain_3", "completed")
    const revived = await mgr.revive({
      taskId: seeded.id,
      prompt: "after drain",
      parentSessionID: "sess_nested_child",
      parentMessageID: "msg_new",
    })

    //#then the counter was decremented rather than underflowing or leaking
    expect(revived.status).toBe("running")
    mgr.shutdown()
  })

  test("(5) statusUncertain needs force and a session-less handle is unrevivable", async () => {
    //#given one uncertain handle with a session and one terminal handle without
    const { client } = makeClient()
    const mgr = makeManager(client, TMP_DIR, { defaultConcurrency: 5 })
    const uncertain = seedTask("bg_uncertain", "sess_uncertain", "statusUncertain")
    const sessionless = seedTask("bg_sessionless", undefined, "stopped")

    //#when revived without force
    const noForce = mgr.revive({
      taskId: uncertain.id,
      prompt: "no force",
      parentSessionID: "sess_parent",
      parentMessageID: "msg_new",
    })

    //#then unknown liveness is refused
    await expect(noForce).rejects.toThrow(/unknown liveness/)

    //#when force is supplied instead
    const forced = await mgr.revive({
      taskId: uncertain.id,
      prompt: "with force",
      parentSessionID: "sess_parent",
      parentMessageID: "msg_new",
      force: true,
    })

    //#then it proceeds
    expect(forced.status).toBe("running")

    //#when a handle that never produced a session is revived
    const noSession = mgr.revive({
      taskId: sessionless.id,
      prompt: "cannot work",
      parentSessionID: "sess_parent",
      parentMessageID: "msg_new",
    })

    //#then it is refused for the right reason
    await expect(noSession).rejects.toThrow(/no session to revive/)
    mgr.shutdown()
  })
})
