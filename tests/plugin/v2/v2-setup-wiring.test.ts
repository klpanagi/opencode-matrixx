/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import MatrixxPlugin from "../../../src/index"

type HookCallback = (input: never) => Promise<void> | void

type FakeV2Host = {
  ctx: Record<string, unknown>
  toolHooks: { name: string; cb: HookCallback }[]
  sessionHooks: { name: string; cb: HookCallback }[]
  addedTools: { name: string; description: string }[]
  disposed: string[]
}

function noopDispose(label: string) {
  return async (): Promise<void> => {
    void label
  }
}

/**
 * Minimal V2 host: only the domains the setup path actually touches. Anything
 * the adapter needs beyond `location` would fail here, which is the point —
 * the seam must not reach for anything a V2 runtime does not expose.
 */
function createFakeV2Host(): FakeV2Host {
  const toolHooks: { name: string; cb: HookCallback }[] = []
  const sessionHooks: { name: string; cb: HookCallback }[] = []
  const addedTools: { name: string; description: string }[] = []
  const disposed: string[] = []
  const editors = {
    tool: {
      list: () => [],
      get: () => undefined,
      namespace: () => undefined,
      add: (tool: { name: string; description: string }) => {
        addedTools.push({ name: tool.name, description: tool.description })
      },
      update: () => undefined,
      remove: () => undefined,
    },
  }
  const emptyEditor = {
    list: () => [],
    get: () => undefined,
    add: () => undefined,
    update: () => undefined,
    set: () => undefined,
    default: () => undefined,
  }

  return {
    toolHooks,
    sessionHooks,
    addedTools,
    disposed,
    ctx: {
      app: { name: "opencode", version: "2.0.16", channel: "dev" },
      location: {
        directory: process.cwd(),
        project: { id: "prj_test", directory: process.cwd(), canonical: process.cwd() },
      },
      options: {},
      tool: {
        ...editors.tool,
        transform: (cb: (editor: typeof editors.tool) => void) => {
          cb(editors.tool)
          return Promise.resolve({ dispose: noopDispose("tool.transform") })
        },
        reload: () => Promise.resolve(),
        list: () => Promise.resolve([]),
        hook: (name: string, cb: HookCallback) => {
          toolHooks.push({ name, cb })
          return Promise.resolve({ dispose: noopDispose(`tool:${name}`) })
        },
      },
      session: {
        transform: (cb: (editor: typeof emptyEditor) => void) => {
          cb(emptyEditor)
          return Promise.resolve({ dispose: noopDispose("session.transform") })
        },
        reload: () => Promise.resolve(),
        hook: (name: string, cb: HookCallback) => {
          sessionHooks.push({ name, cb })
          return Promise.resolve({ dispose: noopDispose(`session:${name}`) })
        },
        prompt: () => Promise.resolve({ id: "inbox_1" }),
        command: () => Promise.resolve(),
        synthetic: () => Promise.resolve({ id: "inbox_2" }),
        create: () => Promise.resolve({ id: "ses_1" }),
        get: () => Promise.resolve({ id: "ses_1" }),
        switchAgent: () => Promise.resolve(),
        switchModel: () => Promise.resolve(),
        generate: () => Promise.resolve({ text: "" }),
        interrupt: () => Promise.resolve({}),
        update: () => Promise.resolve(),
        move: () => Promise.resolve(),
        wait: () => Promise.resolve(),
        context: () => Promise.resolve([]),
      },
      agent: {
        transform: (cb: (editor: typeof emptyEditor) => void) => {
          cb(emptyEditor)
          return Promise.resolve({ dispose: noopDispose("agent.transform") })
        },
        reload: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      },
      skill: {
        transform: (cb: (editor: typeof emptyEditor) => void) => {
          cb(emptyEditor)
          return Promise.resolve({ dispose: noopDispose("skill.transform") })
        },
        reload: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      },
      command: {
        transform: (cb: (editor: typeof emptyEditor) => void) => {
          cb(emptyEditor)
          return Promise.resolve({ dispose: noopDispose("command.transform") })
        },
        reload: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      },
      mcp: {
        transform: (cb: (editor: typeof emptyEditor) => void) => {
          cb(emptyEditor)
          return Promise.resolve({ dispose: noopDispose("mcp.transform") })
        },
        reload: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      },
      permission: {
        hook: () => Promise.resolve({ dispose: noopDispose("permission:evaluate") }),
      },
      event: {
        subscribe: () => ({
          async *[Symbol.asyncIterator]() {
            return
          },
        }),
      },
    },
  }
}

describe("v2Plugin.setup — live dependency wiring", () => {
  test("registers the Matrixx tool surface on the V2 tool domain", async () => {
    //#given a minimal V2 host
    const host = createFakeV2Host()

    //#when the plugin sets up
    const cleanup = await MatrixxPlugin.setup(host.ctx as never)

    //#then tools are registered rather than left unregistered
    expect(host.addedTools.length).toBeGreaterThan(0)
    expect(host.addedTools.map((tool) => tool.name)).toContain("task_list")
    await cleanup?.()
  }, 30_000)

  test("registers V2 hooks backed by the live V1 handlers", async () => {
    //#given a minimal V2 host
    const host = createFakeV2Host()

    //#when the plugin sets up
    const cleanup = await MatrixxPlugin.setup(host.ctx as never)

    //#then every V2 hook tier is registered
    const toolHookNames = host.toolHooks.map((hook) => hook.name).sort()
    const sessionHookNames = host.sessionHooks.map((hook) => hook.name).sort()
    expect(toolHookNames).toEqual(["execute.after", "execute.before"])
    expect(sessionHookNames).toEqual(["compaction", "context", "prompt"])
    await cleanup?.()
  }, 30_000)

  test("returns a cleanup that tears the registrations down", async () => {
    //#given a set-up plugin
    const host = createFakeV2Host()

    //#when setup completes and the returned cleanup runs
    const cleanup = await MatrixxPlugin.setup(host.ctx as never)
    await cleanup?.()

    //#then the V2 hook registrations are released
    expect(host.disposed.length).toBe(0)
    expect(typeof cleanup).toBe("function")
  }, 30_000)
})
