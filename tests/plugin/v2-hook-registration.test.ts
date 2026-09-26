/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { CreatedHooks } from "../../src/create-hooks"
import { createCompactionHandler } from "../../src/plugin/compaction"
import { registerV2Hooks } from "../../src/plugin/v2/register-hooks"
import type { V2EventItem, V2HookRegistrar } from "../../src/plugin/v2/v2-hook-types"

type HookCallback = (input: never) => Promise<void> | void

type FakeRegistrar = {
  ctx: V2HookRegistrar
  toolHooks: { name: string; cb: HookCallback }[]
  sessionHooks: { name: string; cb: HookCallback }[]
  disposed: string[]
  pushEvent: (event: unknown) => void
  waitForEvent: () => Promise<void>
}

/**
 * Fake V2 plugin context that records every hook registration instead of
 * handing it to a real runtime. `event.subscribe` returns a real
 * AsyncIterable, because the V2 event domain does NOT return a Registration.
 */
function createFakeRegistrar(): FakeRegistrar {
  const toolHooks: { name: string; cb: HookCallback }[] = []
  const sessionHooks: { name: string; cb: HookCallback }[] = []
  const disposed: string[] = []
  const queue: V2EventItem[] = []
  let notify: (() => void) | null = null

  const dispose = (label: string) => async (): Promise<void> => {
    disposed.push(label)
  }

  const ctx: V2HookRegistrar = {
    tool: {
      hook: (name, cb) => {
        toolHooks.push({ name, cb })
        return Promise.resolve({ dispose: dispose(`tool:${name}`) })
      },
    },
    session: {
      hook: (name, cb) => {
        sessionHooks.push({ name, cb })
        return Promise.resolve({ dispose: dispose(`session:${name}`) })
      },
    },
    event: {
      subscribe: () => ({
        async *[Symbol.asyncIterator]() {
          while (true) {
            if (queue.length === 0) {
              await new Promise<void>((resolve) => {
                notify = resolve
              })
              continue
            }
            const next = queue.shift()
            if (next !== undefined) yield next
          }
        },
      }),
    },
  }

  return {
    ctx,
    toolHooks,
    sessionHooks,
    disposed,
    pushEvent: (event: unknown) => {
      queue.push(event as V2EventItem)
      notify?.()
    },
    waitForEvent: async () => {
      for (let i = 0; i < 50 && queue.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1))
      }
    },
  }
}

function makeToolBeforeInput(): Record<string, unknown> {
  return {
    tool: "bash",
    sessionID: "ses_1",
    agent: "build",
    messageID: "msg_1",
    id: "call_1",
    input: { command: "ls" },
  }
}

function makeSessionHookInput(): Record<string, unknown> {
  return {
    sessionID: "ses_1",
    messageID: "msg_1",
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude" },
    system: [],
    messages: [],
    options: {},
    tools: {},
  }
}

function stubHooks(overrides: Record<string, unknown> = {}): CreatedHooks {
  return overrides as unknown as CreatedHooks
}

describe("registerV2Hooks — V2 domain registrations", () => {
  test("registers and fires ctx.tool.hook('execute.before')", async () => {
    //#given
    const fake = createFakeRegistrar()
    const calls: unknown[] = []
    const cleanup = await registerV2Hooks(fake.ctx, {
      toolExecuteBefore: (input, output) => {
        calls.push({ input, output })
        output.args.command = "ls -la"
        return Promise.resolve()
      },
    })
    const before = fake.toolHooks.find((h) => h.name === "execute.before")

    //#when
    await before?.cb(makeToolBeforeInput() as never)

    //#then
    expect(before).toBeDefined()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      input: { tool: "bash", sessionID: "ses_1", callID: "call_1" },
      output: { args: { command: "ls -la" } },
    })
    await cleanup?.()
  })

  test("registers and fires ctx.tool.hook('execute.after') with the tool result", async () => {
    //#given
    const fake = createFakeRegistrar()
    const outputs: unknown[] = []
    await registerV2Hooks(fake.ctx, {
      toolExecuteAfter: (_input, output) => {
        outputs.push(output)
        return Promise.resolve()
      },
    })
    const after = fake.toolHooks.find((h) => h.name === "execute.after")

    //#when
    await after?.cb({
      ...makeToolBeforeInput(),
      status: "completed",
      result: { title: "ls", output: "file.txt", metadata: { exit: 0 } },
    } as never)

    //#then
    expect(outputs[0]).toEqual({ title: "bash", output: "file.txt", metadata: { exit: 0 } })
  })

  test("skips the after-hook body when the tool call errored", async () => {
    //#given
    const fake = createFakeRegistrar()
    const outputs: unknown[] = []
    await registerV2Hooks(fake.ctx, {
      toolExecuteAfter: (_input, output) => {
        outputs.push(output)
        return Promise.resolve()
      },
    })
    const after = fake.toolHooks.find((h) => h.name === "execute.after")

    //#when
    await after?.cb({
      ...makeToolBeforeInput(),
      status: "error",
      error: { name: "ToolError", data: { message: "boom" } },
    } as never)

    //#then
    expect(outputs[0]).toBeUndefined()
  })

  test("registers and fires ctx.session.hook('prompt')", async () => {
    //#given
    const fake = createFakeRegistrar()
    const received: unknown[] = []
    await registerV2Hooks(fake.ctx, {
      chatMessage: (input, output) => {
        received.push({ input, output })
        return Promise.resolve()
      },
    })
    const prompt = fake.sessionHooks.find((h) => h.name === "prompt")

    //#when
    await prompt?.cb({
      sessionID: "ses_1",
      messageID: "msg_1",
      prompt: { parts: [{ id: "p1", type: "text", text: "hi" }] },
      delivery: "user",
    } as never)

    //#then
    expect(prompt).toBeDefined()
    expect(received[0]).toEqual({
      input: { sessionID: "ses_1" },
      output: { message: { parts: [{ id: "p1", type: "text", text: "hi" }] }, parts: [] },
    })
  })

  test("registers and fires ctx.session.hook('context') and forwards messages", async () => {
    //#given
    const fake = createFakeRegistrar()
    const seen: unknown[] = []
    await registerV2Hooks(fake.ctx, {
      messagesTransform: (_input, output) => {
        seen.push(output)
        return Promise.resolve()
      },
    })
    const context = fake.sessionHooks.find((h) => h.name === "context")
    const v2Input = makeSessionHookInput()

    //#when
    await context?.cb(v2Input as never)

    //#then
    expect(context).toBeDefined()
    expect(seen[0]).toEqual({ messages: [] })
  })

  test("registers and fires ctx.session.hook('compaction') with the real compaction logic", async () => {
    //#given
    const fake = createFakeRegistrar()
    const captured: string[] = []
    const hooks = stubHooks({
      compactionTodoPreserver: { capture: async (sessionID: string) => Promise.resolve(captured.push(sessionID)) },
      compactionContextInjector: (sessionID: string) => `injected:${sessionID}`,
      planPersister: {
        buildRehydrationContext: (sessionID: string) => `plan:${sessionID}`,
      },
      evolutionCompressor: null,
    })
    await registerV2Hooks(fake.ctx, { sessionCompacting: createCompactionHandler({ hooks }) })
    const compaction = fake.sessionHooks.find((h) => h.name === "compaction")
    const v2Input = makeSessionHookInput()

    //#when
    await compaction?.cb(v2Input as never)

    //#then the rehydration context reaches the V2 runtime as system parts
    expect(compaction).toBeDefined()
    expect(captured).toEqual(["ses_1"])
    expect(v2Input.system).toEqual([
      { type: "text", text: "injected:ses_1" },
      { type: "text", text: "plan:ses_1" },
    ])
  })

  test("returns a Cleanup that disposes every Registration", async () => {
    //#given
    const fake = createFakeRegistrar()

    //#when
    const cleanup = await registerV2Hooks(fake.ctx, {})
    await cleanup?.()

    //#then LIFO teardown: last registered hook is disposed first
    expect(fake.disposed).toEqual([
      "session:compaction",
      "session:context",
      "session:prompt",
      "tool:execute.after",
      "tool:execute.before",
    ])
  })

  test("consumes ctx.event.subscribe() as an AsyncIterable (no Registration)", async () => {
    //#given
    const fake = createFakeRegistrar()
    const seen: unknown[] = []
    await registerV2Hooks(fake.ctx, {
      event: (input) => {
        seen.push(input)
        return Promise.resolve()
      },
    })

    //#when
    fake.pushEvent({ type: "session.idle", data: { info: { id: "ses_1" } } })
    await fake.waitForEvent()
    await new Promise((resolve) => setTimeout(resolve, 5))

    //#then
    expect(seen[0]).toEqual({
      event: { type: "session.idle", properties: { info: { id: "ses_1" } } },
    })
  })
})
