/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { withEphemeralSession } from "../../src/shared/with-ephemeral-session"
import { createHostLlmCall } from "../../src/hooks/evolution-compressor/host-llm-call"

function makeIds(): { created: string[]; deleted: string[] } {
  return { created: [], deleted: [] }
}

function makeClient(opts: {
  createResult: unknown
  promptImpl?: (args: unknown) => Promise<unknown>
  messagesImpl?: (args: unknown) => Promise<unknown>
  deleteImpl?: (args: unknown) => Promise<unknown>
  tracker: { created: string[]; deleted: string[] }
}): {
  session: {
    create: (args: unknown) => Promise<unknown>
    prompt: (args: unknown) => Promise<unknown>
    messages: (args: unknown) => Promise<unknown>
    delete: (args: unknown) => Promise<unknown>
  }
} {
  return {
    session: {
      create: async (args: unknown) => {
        opts.tracker.created.push(JSON.stringify(args))
        return opts.createResult
      },
      prompt: async (args: unknown) => (opts.promptImpl ? opts.promptImpl(args) : {}),
      messages: async (args: unknown) => (opts.messagesImpl ? opts.messagesImpl(args) : []),
      delete: async (args: unknown) => {
        opts.tracker.deleted.push(JSON.stringify(args))
        return opts.deleteImpl ? opts.deleteImpl(args) : { data: true }
      },
    },
  }
}

describe("withEphemeralSession", () => {
  test("deletes the session on success", async () => {
    //#given a client whose create returns a session id
    const tracker = makeIds()
    const client = makeClient({ createResult: { data: { id: "ses-1" } }, tracker })

    //#when the body runs successfully
    const result = await withEphemeralSession({
      client: client as never,
      directory: "/tmp",
      title: "evolution-compressor",
      body: async (id) => `used-${id}`,
    })

    //#then the body result is returned and delete was called for the id
    expect(result).toBe("used-ses-1")
    expect(tracker.deleted.length).toBe(1)
    expect(tracker.deleted[0]).toContain("ses-1")
  })

  test("deletes the session when the body throws and rethrows the original error", async () => {
    //#given a body that throws
    const tracker = makeIds()
    const client = makeClient({ createResult: { data: { id: "ses-2" } }, tracker })
    const boom = new Error("body boom")

    //#when the body throws
    const caught = await withEphemeralSession({
      client: client as never,
      directory: "/tmp",
      title: "evolution-compressor",
      body: async () => {
        throw boom
      },
    }).then(
      () => null,
      (err: unknown) => err,
    )

    //#then the original error propagates and delete still ran
    expect(caught).toBe(boom)
    expect(tracker.deleted.length).toBe(1)
  })

  test("body error propagates even when delete fails", async () => {
    //#given a body that throws and a delete that reports error
    const tracker = makeIds()
    const client = makeClient({
      createResult: { data: { id: "ses-3" } },
      deleteImpl: async () => ({ data: false, error: { message: "delete failed" } }),
      tracker,
    })
    const boom = new Error("original body error")

    //#when both body and delete fail
    const caught = await withEphemeralSession({
      client: client as never,
      directory: "/tmp",
      title: "evolution-compressor",
      body: async () => {
        throw boom
      },
    }).then(
      () => null,
      (err: unknown) => err,
    )

    //#then the body's error (not the delete error) propagates
    expect(caught).toBe(boom)
    expect(tracker.deleted.length).toBe(1)
  })

  test("does not attempt delete when creation yields no id", async () => {
    //#given a create result with no id
    const tracker = makeIds()
    const client = makeClient({ createResult: { data: {} }, tracker })

    //#when the body would run
    let bodyRan = false
    const caught = await withEphemeralSession({
      client: client as never,
      directory: "/tmp",
      title: "evolution-compressor",
      body: async () => {
        bodyRan = true
        return "x"
      },
    }).then(
      () => null,
      (err: unknown) => err,
    )

    //#then creation failure throws and delete never ran
    expect(caught).toBeInstanceOf(Error)
    expect(bodyRan).toBe(false)
    expect(tracker.deleted.length).toBe(0)
  })

  test("passes parentID through to create", async () => {
    //#given a parent id
    const tracker = makeIds()
    const client = makeClient({ createResult: { data: { id: "ses-4" } }, tracker })

    //#when running with a parentID
    await withEphemeralSession({
      client: client as never,
      directory: "/tmp",
      title: "evolution-compressor",
      parentID: "ses-parent",
      body: async () => "ok",
    })

    //#then create carried the parentID
    expect(tracker.created.length).toBe(1)
    expect(tracker.created[0]).toContain("ses-parent")
  })
})

describe("createHostLlmCall session hygiene", () => {
  test("deletes the ephemeral session after prompt+messages", async () => {
    //#given a host llm client mock
    const tracker = makeIds()
    const client = makeClient({
      createResult: { data: { id: "ses-host-1" } },
      messagesImpl: async () => [
        { info: { role: "assistant", time: { created: 2 } }, parts: [{ type: "text", text: "hello" }] },
      ],
      tracker,
    })

    //#when the llm call runs
    const call = createHostLlmCall({ client: client as never, directory: "/tmp" })
    const result = await call("summarize this")

    //#then text is returned and the session was deleted
    expect(result.text).toBe("hello")
    expect(tracker.deleted.length).toBe(1)
    expect(tracker.deleted[0]).toContain("ses-host-1")
  })

  test("deletes the ephemeral session when prompt throws", async () => {
    //#given a prompt that throws
    const tracker = makeIds()
    const client = makeClient({
      createResult: { data: { id: "ses-host-2" } },
      promptImpl: async () => {
        throw new Error("prompt down")
      },
      tracker,
    })

    //#when the llm call runs
    const call = createHostLlmCall({ client: client as never, directory: "/tmp" })
    const caught = await call("summarize this").then(
      () => null,
      (err: unknown) => err,
    )

    //#then the error propagates and the session was deleted
    expect(caught).toBeInstanceOf(Error)
    expect(tracker.deleted.length).toBe(1)
    expect(tracker.deleted[0]).toContain("ses-host-2")
  })
})
