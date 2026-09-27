/// <reference types="bun-types" />
/**
 * Shared fixtures for the background-agent task-store completion gate tests.
 *
 * Every task is built with `TaskObjectSchema.parse` — a hand-rolled object
 * missing `description` fails the `.strict()` schema and produces a
 * convincing false negative (prior-plan learnings, T1).
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import type { MatrixxConfig } from "../../../src/config/schema"
import { BackgroundManager } from "../../../src/features/background-agent/manager"
import type { BackgroundTask } from "../../../src/features/background-agent/types"
import { TaskObjectSchema } from "../../../src/tools/task/types"

export const CHILD_SESSION = "ses_child_gate"

/**
 * A client whose child session is idle and already produced assistant output,
 * so both the session.idle gate and the polling gate reach the task-store
 * predicate instead of bailing out on a "no output yet" guard.
 */
function makeClient(directory: string) {
  return {
    session: {
      get: async () => ({ data: { directory } }),
      create: async () => ({ data: { id: CHILD_SESSION } }),
      status: async () => ({ data: { [CHILD_SESSION]: { type: "idle" } } }),
      messages: async () => ({
        data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "done" }] }],
      }),
      prompt: async () => ({}),
      promptAsync: async () => ({}),
      abort: async () => ({}),
      todo: async () => ({ data: [] }),
    },
  }
}

export function makeManager(directory: string, pluginConfig?: Partial<MatrixxConfig>): BackgroundManager {
  return new BackgroundManager(
    { client: makeClient(directory), directory } as unknown as PluginInput,
    undefined,
    pluginConfig ? { pluginConfig } : undefined,
  )
}

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** Write one schema-valid task into `storeDir` — the exact shape `task_create` writes. */
export function writeTask(storeDir: string, projectRoot: string): string {
  mkdirSync(storeDir, { recursive: true })
  const task = TaskObjectSchema.parse({
    id: `T-${projectRoot.replace(/[^a-zA-Z0-9]/g, "")}-0000-4000-8000-000000000001`,
    subject: "unfinished work",
    description: "",
    status: "in_progress",
    blocks: [],
    blockedBy: [],
    threadID: CHILD_SESSION,
    projectRoot,
  })
  writeFileSync(join(storeDir, `${task.id}.json`), JSON.stringify(task))
  return task.id
}

/**
 * Write one schema-valid task whose FILE mtime is backdated by `ageMs`.
 *
 * Staleness is decided purely by `statSync().mtimeMs` (`getTaskAgeMs`), so ageing
 * a fixture means ageing the file on disk — not the JSON payload, and not the
 * task's own timestamps.
 */
export function writeAgedTask(
  storeDir: string,
  projectRoot: string,
  ageMs: number,
  overrides?: { id?: string; threadID?: string },
): string {
  mkdirSync(storeDir, { recursive: true })
  const task = TaskObjectSchema.parse({
    id:
      overrides?.id ??
      `T-${projectRoot.replace(/[^a-zA-Z0-9]/g, "")}-0000-4000-8000-000000000002`,
    subject: "unfinished work",
    description: "",
    status: "in_progress",
    blocks: [],
    blockedBy: [],
    threadID: overrides?.threadID ?? CHILD_SESSION,
    projectRoot,
  })
  const file = join(storeDir, `${task.id}.json`)
  writeFileSync(file, JSON.stringify(task))
  const seconds = (Date.now() - ageMs) / 1000
  utimesSync(file, seconds, seconds)
  return task.id
}

export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/** Launch a running child task and backdate `startedAt` past MIN_IDLE_TIME_MS. */
export async function launchBackdatedTask(manager: BackgroundManager): Promise<BackgroundTask> {
  const launched = await manager.launch({
    description: "Investigate the thing",
    prompt: "do the thing",
    agent: "explore",
    parentSessionID: "ses_parent",
    parentMessageID: "msg_parent",
  })
  await waitFor(() => manager.getTask(launched.id)?.status === "running")
  const task = manager.getTask(launched.id)
  if (task?.startedAt) task.startedAt = new Date(Date.now() - 60_000)
  return task as BackgroundTask
}

export function shutdownQuietly(manager: BackgroundManager): void {
  try {
    manager.shutdown()
  } catch {
    // Best-effort cleanup between tests.
  }
}

export function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup between tests.
    }
  }
}

export type PollableManager = { pollRunningTasks: () => Promise<void> }

export async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
