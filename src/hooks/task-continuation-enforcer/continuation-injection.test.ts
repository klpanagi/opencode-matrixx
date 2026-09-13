/// <reference types="bun-types" />
import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { injectContinuation } from "./continuation-injection"
import { createSessionStateStore } from "./session-state"

function writeValidTask(dir: string, id: string, status = "pending", threadID?: string): void {
  const task: Record<string, unknown> = { id, subject: `task ${id}`, description: "d", status, blocks: [], blockedBy: [] }
  if (threadID) task.threadID = threadID
  mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
  writeFileSync(join(dir, ".matrixx", "tasks", `${id}.json`), JSON.stringify(task))
}

function makeInjectionCtx(dir: string): { ctx: PluginInput; promptAsync: ReturnType<typeof mock> } {
  const promptAsync = mock(async () => ({} as never))
  const ctx = {
    directory: dir,
    client: {
      tui: { showToast: mock(async () => ({} as never)) },
      session: {
        messages: async () => ({ data: [] } as unknown as never) as never,
        promptAsync,
      },
    },
  } as unknown as PluginInput
  return { ctx, promptAsync }
}

const resolvedInfo = {
  agent: "morpheus",
  model: { providerID: "p", modelID: "m" },
  tools: { edit: true },
}

describe("task-continuation continuation-injection", () => {
  test("skips injection when only stale tasks remain", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-inject-"))
    writeValidTask(dir, "T-stale", "pending", "s-inject")
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000)
    utimesSync(join(dir, ".matrixx", "tasks", "T-stale.json"), old, old)
    const { ctx, promptAsync } = makeInjectionCtx(dir)
    const store = createSessionStateStore()
    const config = { morpheus: { tasks: { stale_after_hours: 2 } } }
    //#when
    await injectContinuation({ ctx, sessionID: "s-inject", sessionStateStore: store, resolvedInfo, config })
    //#then
    expect(promptAsync).not.toHaveBeenCalled()
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  test("injects continuation when a fresh task exists", async () => {
    //#given
    const dir = mkdtempSync(join(tmpdir(), "task-inject-"))
    writeValidTask(dir, "T-fresh", "pending", "s-inject2")
    const { ctx, promptAsync } = makeInjectionCtx(dir)
    const store = createSessionStateStore()
    //#when
    await injectContinuation({ ctx, sessionID: "s-inject2", sessionStateStore: store, resolvedInfo })
    //#then
    expect(promptAsync).toHaveBeenCalledTimes(1)
    store.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })
})