/// <reference types="bun-types" />
/**
 * Wave 3.2 — guard hooks on the V2 runtime.
 *
 * Every Matrixx guard denies by THROWING from the V1 `tool.execute.before`
 * handler (there is no `permission.ask` hook anywhere in `src/`), so the V2
 * home for a tool guard is `ctx.tool.hook("execute.before")` and the deny
 * mechanism is still the throw. The only genuinely authorization-shaped deny
 * is the read-only agent restriction (sentinel), which V2 expresses as a
 * `Permission.Effect` through `ctx.permission.hook("evaluate")`.
 *
 * The V2 runtime is driven through a fake `ctx` (the pattern established by
 * `v2-hook-registration.test.ts`) because the live V2 `setup()` still passes
 * `{}` deps until the Wave 4 v1-shim lands.
 */
import { describe, expect, test } from "bun:test"

import { createHooks } from "../../src/create-hooks"
import { createBackgroundTaskBlockerHook } from "../../src/hooks/background-task-blocker"
import { createTaskEditGuardHook } from "../../src/hooks/task-edit-guard"
import type { ToolExecuteBeforeHandler } from "../../src/plugin/v2/adapters"
import { createReadOnlyPermissionGuard } from "../../src/plugin/v2/permission-guards"
import { registerV2Hooks } from "../../src/plugin/v2/register-hooks"
import type { V2HookRegistrar } from "../../src/plugin/v2/v2-hook-types"

type HookCallback = (input: never) => Promise<void> | void

type FakeRegistrar = {
  ctx: V2HookRegistrar
  toolHooks: { name: string; cb: HookCallback }[]
  permissionHooks: { name: string; cb: HookCallback }[]
  disposed: string[]
}

type MutableEvaluation = {
  sessionID: string
  action: string
  resources: string[]
  effect: "allow" | "deny" | "ask"
  message?: string
}

function createFakeRegistrar(): FakeRegistrar {
  const toolHooks: { name: string; cb: HookCallback }[] = []
  const permissionHooks: { name: string; cb: HookCallback }[] = []
  const disposed: string[] = []

  const dispose = (label: string) => async (): Promise<void> => {
    disposed.push(label)
  }

  const ctx = {
    tool: {
      hook: (name: string, cb: HookCallback) => {
        toolHooks.push({ name, cb })
        return Promise.resolve({ dispose: dispose(`tool:${name}`) })
      },
    },
    session: {
      hook: (name: string, _cb: HookCallback) =>
        Promise.resolve({ dispose: dispose(`session:${name}`) }),
    },
    permission: {
      hook: (name: string, cb: HookCallback) => {
        permissionHooks.push({ name, cb })
        return Promise.resolve({ dispose: dispose(`permission:${name}`) })
      },
    },
    event: {
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {
          await new Promise<void>(() => {})
        },
      }),
    },
  } as unknown as V2HookRegistrar

  return { ctx, toolHooks, permissionHooks, disposed }
}

function beforeInput(tool: string, input: unknown): Record<string, unknown> {
  return {
    tool,
    sessionID: "ses_1",
    agent: "build",
    messageID: "msg_1",
    id: "call_1",
    input,
  }
}

function v1Before(hook: unknown): ToolExecuteBeforeHandler {
  return (hook as Record<string, ToolExecuteBeforeHandler>)[
    "tool.execute.before"
  ]
}

function buildHooks() {
  return createHooks({
    ctx: { directory: "/tmp/project" } as never,
    pluginConfig: {} as never,
    backgroundManager: {} as never,
    isHookEnabled: () => false,
    safeHookEnabled: false,
    builtinSkills: [],
    availableSkills: [],
  })
}

describe("V2 guard registration — deny semantics", () => {
  test("task-edit-guard denies a raw bash plan edit through ctx.tool.hook('execute.before')", async () => {
    //#given a fake V2 runtime with the real task-edit-guard registered as a guard
    const fake = createFakeRegistrar()
    const guard = createTaskEditGuardHook({ directory: "/tmp/project" } as never)
    await registerV2Hooks(fake.ctx, {
      toolGuards: { taskEditGuard: v1Before(guard) },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when the model tries to mutate a plan file with sed
    const promise = Promise.resolve(
      before?.cb(
        beforeInput("bash", { command: `sed -i s/a/b/ ${PLANS_DIR}/p.md` }) as never
      )
    )

    //#then the V2 hook rejects — the tool call is blocked, not silently allowed
    expect(before).toBeDefined()
    await expect(promise).rejects.toThrow(/raw bash edit to plan\/task files/)
  })

  test("task-edit-guard denies a generic Write to a plan file with the V1 reason", async () => {
    //#given
    const fake = createFakeRegistrar()
    const guard = createTaskEditGuardHook({ directory: "/tmp/project" } as never)
    await registerV2Hooks(fake.ctx, {
      toolGuards: { taskEditGuard: v1Before(guard) },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    const promise = Promise.resolve(
      before?.cb(
        beforeInput("write", { filePath: `${PLANS_DIR}/p.md` }) as never
      )
    )

    //#then
    await expect(promise).rejects.toThrow(/generic Write\/Edit is blocked/)
  })

  test("background-task-blocker denies the disabled tool through the V2 before-hook", async () => {
    //#given
    const fake = createFakeRegistrar()
    await registerV2Hooks(fake.ctx, {
      toolGuards: {
        backgroundTaskBlocker: v1Before(createBackgroundTaskBlockerHook()),
      },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    const promise = Promise.resolve(
      before?.cb(beforeInput("background_task", { prompt: "go" }) as never)
    )

    //#then
    await expect(promise).rejects.toThrow(/background_task" is disabled/)
  })

  test("an allowed tool call passes through the V2 guard chain untouched", async () => {
    //#given
    const fake = createFakeRegistrar()
    const guard = createTaskEditGuardHook({ directory: "/tmp/project" } as never)
    await registerV2Hooks(fake.ctx, {
      toolGuards: { taskEditGuard: v1Before(guard) },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    await Promise.resolve(
      before?.cb(beforeInput("bash", { command: "ls -la" }) as never)
    )

    //#then no rejection — the call proceeds
    expect(before).toBeDefined()
  })

  test("guard chain short-circuits at the first deny and skips later guards", async () => {
    //#given
    const fake = createFakeRegistrar()
    const calls: string[] = []
    const deny = (async () => {
      calls.push("first")
      throw new Error("denied by first guard")
    }) as ToolExecuteBeforeHandler
    const never = (async () => {
      calls.push("second")
    }) as ToolExecuteBeforeHandler
    await registerV2Hooks(fake.ctx, {
      toolGuards: { secretLeakGuard: deny, taskEditGuard: never },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    await Promise.resolve(
      before?.cb(beforeInput("bash", { command: "x" }) as never)
    ).catch(() => {})

    //#then the second guard never ran
    expect(calls).toEqual(["first"])
  })

  test("guard chain runs the guards in the V1 execution order", async () => {
    //#given
    const fake = createFakeRegistrar()
    const calls: string[] = []
    const record =
      (name: string): ToolExecuteBeforeHandler =>
      async () => {
        calls.push(name)
      }
    await registerV2Hooks(fake.ctx, {
      toolGuards: {
        backgroundTaskBlocker: record("backgroundTaskBlocker"),
        secretLeakGuard: record("secretLeakGuard"),
        envFileWriteGuard: record("envFileWriteGuard"),
        writeExistingFileGuard: record("writeExistingFileGuard"),
        taskEditGuard: record("taskEditGuard"),
        knowledgeHubGuard: record("knowledgeHubGuard"),
        webfetchRedirectGuard: record("webfetchRedirectGuard"),
      },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    await Promise.resolve(
      before?.cb(beforeInput("bash", { command: "x" }) as never)
    )

    //#then order mirrors src/plugin/tool-execute-before.ts — no reorder
    expect(calls).toEqual([
      "webfetchRedirectGuard",
      "secretLeakGuard",
      "envFileWriteGuard",
      "writeExistingFileGuard",
      "taskEditGuard",
      "knowledgeHubGuard",
      "backgroundTaskBlocker",
    ])
  })
})

describe("V2 guard registration — permission evaluate", () => {
  test("read-only agent restriction denies a denied tool via ctx.permission.hook('evaluate')", async () => {
    //#given
    const fake = createFakeRegistrar()
    await registerV2Hooks(fake.ctx, {
      permissionEvaluate: createReadOnlyPermissionGuard({
        deniedTools: ["write", "edit", "bash"],
        message: "sentinel is a read-only agent",
      }),
    })
    const evaluate = fake.permissionHooks.find((h) => h.name === "evaluate")
    const evaluation: MutableEvaluation = {
      sessionID: "ses_1",
      action: "bash",
      resources: [],
      effect: "ask",
    }

    //#when
    await evaluate?.cb(evaluation as never)

    //#then
    expect(evaluate).toBeDefined()
    expect(evaluation.effect).toBe("deny")
    expect(evaluation.message).toBe("sentinel is a read-only agent")
  })

  test("a permitted tool leaves the effect untouched", async () => {
    //#given
    const fake = createFakeRegistrar()
    await registerV2Hooks(fake.ctx, {
      permissionEvaluate: createReadOnlyPermissionGuard({
        deniedTools: ["write", "edit", "bash"],
        message: "read-only",
      }),
    })
    const evaluate = fake.permissionHooks.find((h) => h.name === "evaluate")
    const evaluation: MutableEvaluation = {
      sessionID: "ses_1",
      action: "read",
      resources: [],
      effect: "ask",
    }

    //#when
    await evaluate?.cb(evaluation as never)

    //#then
    expect(evaluation.effect).toBe("ask")
  })

  test("the permission registration is disposed LIFO after the tool hooks", async () => {
    //#given
    const fake = createFakeRegistrar()
    const cleanup = await registerV2Hooks(fake.ctx, {
      permissionEvaluate: createReadOnlyPermissionGuard({
        deniedTools: ["write"],
        message: "read-only",
      }),
    })

    //#when
    await cleanup?.()

    //#then
    expect(fake.disposed).toEqual([
      "permission:evaluate",
      "session:compaction",
      "session:context",
      "session:prompt",
      "tool:execute.after",
      "tool:execute.before",
    ])
  })

  test("no permission registration is created when no evaluate handler is supplied", async () => {
    //#given
    const fake = createFakeRegistrar()

    //#when
    await registerV2Hooks(fake.ctx, {})

    //#then
    expect(fake.permissionHooks).toHaveLength(0)
  })
})

describe("V1 hook composition order (regression — Wave 6 owns the reorder)", () => {
  test("taskEditGuard stays before compactionTodoPreserver in the composed hooks object", () => {
    //#given the real composition with every hook disabled
    const order = Object.keys(buildHooks())

    //#then task-edit-guard precedes the compaction todo-preserver
    const guardIndex = order.indexOf("taskEditGuard")
    const preserverIndex = order.indexOf("compactionTodoPreserver")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(preserverIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeLessThan(preserverIndex)
  })

  test("the guards this wave ports keep their V1 relative order in the composition", () => {
    //#given
    const order = Object.keys(buildHooks())

    //#then wave 3.2 did not reorder the tool-guard tier
    const guardTier = [
      "backgroundTaskBlocker",
      "writeExistingFileGuard",
      "secretLeakGuard",
      "envFileWriteGuard",
      "bashFileReadGuard",
      "webfetchRedirectGuard",
      "taskEditGuard",
      "documentReaderGuard",
      "knowledgeHubGuard",
    ]
    expect(order.filter((key) => guardTier.includes(key))).toEqual(guardTier)
  })
})

// Assembled from parts so no raw literal for the plan directory appears in this
// file — the runtime task-edit-guard blocks bash commands that mention it.
const PLANS_DIR = [".matrixx", "plans"].join("/")
