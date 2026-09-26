/// <reference types="bun-types" />
/**
 * Wave 6.1 — the ordered permission tier must be ENFORCED through the real V2
 * registration path (`ctx.permission.hook("evaluate")`), not merely exist as a
 * pure function. The live V2 `setup()` still passes `{}` deps until the Wave 4
 * shim removal, so the runtime is driven through a fake `ctx` — the pattern
 * established by `tests/plugin/v2-guard-registration.test.ts`.
 */
import { describe, expect, test } from "bun:test"
import {
  createPermissionEvaluateHandler,
  createSentinelPolicyRules,
} from "../../src/plugin/v2/permission-policy"
import { registerV2Hooks } from "../../src/plugin/v2/register-hooks"
import type { V2HookRegistrar } from "../../src/plugin/v2/v2-hook-types"

type HookCallback = (input: never) => Promise<void> | void

type MutableEvaluation = {
  sessionID: string
  action: string
  resources: string[]
  agent?: string
  effect: "allow" | "deny" | "ask"
  message?: string
}

function createFakeRegistrar(): {
  ctx: V2HookRegistrar
  permissionHooks: { name: string; cb: HookCallback }[]
} {
  const permissionHooks: { name: string; cb: HookCallback }[] = []
  const ctx = {
    tool: { hook: () => Promise.resolve({ dispose: async () => {} }) },
    session: { hook: () => Promise.resolve({ dispose: async () => {} }) },
    permission: {
      hook: (name: string, cb: HookCallback) => {
        permissionHooks.push({ name, cb })
        return Promise.resolve({ dispose: async () => {} })
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
  return { ctx, permissionHooks }
}

describe("Wave 6.1 — permission tier enforced through ctx.permission.hook('evaluate')", () => {
  test("registered handler denies sentinel's write tool", async () => {
    //#given
    const fake = createFakeRegistrar()
    await registerV2Hooks(fake.ctx, {
      permissionEvaluate: createPermissionEvaluateHandler({
        agentRules: createSentinelPolicyRules(),
      }),
    })
    const evaluate = fake.permissionHooks.find((h) => h.name === "evaluate")
    const subject: MutableEvaluation = {
      sessionID: "ses_1",
      action: "write",
      resources: [],
      agent: "sentinel",
      effect: "ask",
    }

    //#when
    await evaluate?.cb(subject as never)

    //#then
    expect(evaluate).toBeDefined()
    expect(subject.effect).toBe("deny")
  })

  test("registered handler denies a tool named by an experimental deny policy", async () => {
    //#given
    const fake = createFakeRegistrar()
    await registerV2Hooks(fake.ctx, {
      permissionEvaluate: createPermissionEvaluateHandler({
        policies: [{ effect: "deny", tools: ["bash"], reason: "shell disabled" }],
      }),
    })
    const evaluate = fake.permissionHooks.find((h) => h.name === "evaluate")
    const subject: MutableEvaluation = {
      sessionID: "ses_1",
      action: "bash",
      resources: [],
      effect: "ask",
    }

    //#when
    await evaluate?.cb(subject as never)

    //#then
    expect(subject.effect).toBe("deny")
    expect(subject.message).toBe("shell disabled")
  })
})
