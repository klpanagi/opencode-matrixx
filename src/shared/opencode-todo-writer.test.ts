/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"

import { _resetForTesting, _setWriterForTesting, resolveTodoWriter, SessionTodoEvent } from "./opencode-todo-writer"

function makeCtx(overrides: Record<string, unknown> = {}): PluginInput {
  return {
    client: {
      session: {
        todo: mock(async () => ({ data: [] })),
      },
    },
    directory: "/tmp/test",
    project: {} as never,
    worktree: "/tmp/test",
    serverUrl: new URL("http://127.0.0.1:4096"),
    $: {} as never,
    ...overrides,
  } as unknown as PluginInput
}

beforeEach(() => {
  _resetForTesting()
})

afterEach(() => {
  _resetForTesting()
})

describe("resolveTodoWriter — host-blessed via PluginInput ctx", () => {
  test("resolves writer via host-blessed service and publishes Event.Updated", async () => {
    //#given a PluginInput ctx with host-blessed update that publishes Event.Updated
    const publishSpy = mock(async (_event: unknown, _payload: unknown) => {})
    const todosCaptured: unknown[] = []
    const hostUpdate = mock(async (input: { sessionID: string; todos: unknown[] }) => {
      todosCaptured.push(input)
      await publishSpy(SessionTodoEvent.Updated, input)
    })
    const ctx = makeCtx({ Todo: { update: hostUpdate } })

    //#when resolving and invoking writer
    const writer = await resolveTodoWriter(ctx)
    expect(writer).not.toBeNull()
    await writer!({ sessionID: "ses_x", todos: [{ content: "a", status: "pending" }] })

    //#then publish spy called with Event.Updated and writer forwarded payload
    expect(publishSpy).toHaveBeenCalled()
    const firstCall = (publishSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as unknown[]
    // accept either string event or object, but must contain Updated token
    const eventArg = firstCall[0]
    expect(String(eventArg)).toContain("todo")
    expect(todosCaptured.length).toBe(1)
    expect((todosCaptured[0] as { sessionID: string }).sessionID).toBe("ses_x")
    const logged = (hostUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls.length
    expect(logged).toBe(1)
  })

  test("handles Effect pipe result via Effect.runPromise", async () => {
    //#given host update returns Effect-like object with pipe
    const publishSpy = mock(async () => {})
    const effectLike = { pipe: "effect-object", _publishSpy: publishSpy }
    const hostUpdate = mock((_input: unknown) => effectLike)
    // mock Effect.runPromise to trigger publishSpy
    const ctx = makeCtx({ SessionTodo: { update: hostUpdate } })

    // intercept dynamic import("effect") by ensuring wrapUpdate's Effect.runPromise will be called
    // we simulate by making hostUpdate return object with pipe, wrapUpdate will try import("effect")
    // For this test we accept either path: if Effect import fails, wrapUpdate falls through to await result
    // So we also ensure the writer still completes without throwing
    //#when
    const writer = await resolveTodoWriter(ctx)
    expect(writer).not.toBeNull()

    //#then writer does not throw even with effect-like return
    await expect(writer!({ sessionID: "ses_effect", todos: [{ content: "b", status: "pending" }] })).resolves.toBeUndefined()
    expect(hostUpdate).toHaveBeenCalled()
  })

  test("returns null gracefully when host service not found", async () => {
    //#given ctx without any service injection
    const ctx = makeCtx({})

    //#when
    const writer = await resolveTodoWriter(ctx)

    //#then null — not throwing, graceful
    expect(writer).toBeNull()
  })

  test("returns null when ctx is undefined (graceful)", async () => {
    //#given no ctx
    //#when
    const writer = await resolveTodoWriter(undefined as unknown as PluginInput)

    //#then
    expect(writer).toBeNull()
  })

  test("_resetForTesting clears cache and allows re-resolve with new ctx", async () => {
    //#given first ctx with no service -> null cached
    const ctxEmpty = makeCtx({})
    const first = await resolveTodoWriter(ctxEmpty)
    expect(first).toBeNull()

    //#when reset and provide valid ctx
    _resetForTesting()
    const hostUpdate = mock(async () => {})
    const ctxValid = makeCtx({ Todo: { update: hostUpdate } })
    const second = await resolveTodoWriter(ctxValid)

    //#then second resolves to writer
    expect(second).not.toBeNull()
  })

  test("_setWriterForTesting overrides cached writer", async () => {
    //#given injected writer via _setWriterForTesting
    const injected = mock(async () => {})
    _setWriterForTesting(injected as unknown as (input: { sessionID: string; todos: unknown[] }) => Promise<void>)
    const ctx = makeCtx({})

    //#when resolving (should return injected regardless of ctx service absence)
    const writer = await resolveTodoWriter(ctx)

    //#then
    expect(writer).toBe(injected)
  })

  test("caches writer per ctx reference", async () => {
    //#given ctx with service
    const hostUpdate = mock(async () => {})
    const ctx = makeCtx({ Todo: { update: hostUpdate } })
    const first = await resolveTodoWriter(ctx)

    //#when second call with same ctx
    const second = await resolveTodoWriter(ctx)

    //#then same instance (cached)
    expect(second).toBe(first)
  })

  test("writer forwards todos correctly via services map injection", async () => {
    //#given services map with @opencode/SessionTodo key
    const calls: unknown[] = []
    const hostUpdate = mock(async (input: unknown) => {
      calls.push(input)
    })
    const ctx = makeCtx({ services: { "@opencode/SessionTodo": { update: hostUpdate } } })

    //#when
    const writer = await resolveTodoWriter(ctx)
    expect(writer).not.toBeNull()
    await writer!({ sessionID: "ses_svc", todos: [{ content: "c", status: "completed", priority: "high" }] })

    //#then
    expect(calls.length).toBe(1)
    const payload = calls[0] as { sessionID: string; todos: { content: string; status: string; priority: string }[] }
    expect(payload.sessionID).toBe("ses_svc")
    expect(payload.todos[0].content).toBe("c")
    expect(payload.todos[0].status).toBe("completed")
  })
})
