/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { createV1SessionSteering } from "../../../src/features/session-steering/v1-steering"
import { createV2SessionSteering } from "../../../src/features/session-steering/v2-steering"
import { resolveSessionOps } from "../../../src/features/session-steering/resolve-session-ops"
import { resolveSessionSteering } from "../../../src/features/session-steering/resolve-steering"

type Call = { method: string; args: unknown }

function makeV1Client() {
  const calls: Call[] = []
  return {
    calls,
    client: {
      session: {
        promptAsync: (args: unknown) => {
          calls.push({ method: "promptAsync", args })
          return Promise.resolve({ data: true })
        },
        prompt: (args: unknown) => {
          calls.push({ method: "prompt", args })
          return Promise.resolve({ data: true })
        },
      },
    },
  }
}

function makeV2Session() {
  const calls: Call[] = []
  return {
    calls,
    session: {
      switchAgent: (args: unknown) => {
        calls.push({ method: "switchAgent", args })
        return Promise.resolve({})
      },
      switchModel: (args: unknown) => {
        calls.push({ method: "switchModel", args })
        return Promise.resolve({})
      },
      prompt: (args: unknown) => {
        calls.push({ method: "prompt", args })
        return Promise.resolve({})
      },
    },
  }
}

function makeV1SessionOpsClient(overrides?: { error?: unknown }) {
  const calls: { createArgs: unknown; client: { session: { create: (args: unknown) => unknown } } } = {
    createArgs: undefined,
    client: undefined as never,
  }
  calls.client = {
    session: {
      create: (args: unknown) => {
        calls.createArgs = args
        if (overrides?.error) return Promise.resolve({ error: overrides.error })
        return Promise.resolve({ data: { id: "ses_child" } })
      },
    },
  }
  return { calls }
}

const BASE = { sessionID: "ses_1", directory: "/tmp/project" }

describe("createV1SessionSteering", () => {
  test("sends the promptAsync body/query shape the V1 SDK expects", async () => {
    //#given
    const { client, calls } = makeV1Client()
    const steering = createV1SessionSteering(client)

    //#when
    await steering.deliver({
      ...BASE,
      text: "continue the mission",
      agent: "architect",
      model: { providerID: "anthropic", modelID: "claude" },
    })

    //#then
    expect(calls).toEqual([
      {
        method: "promptAsync",
        args: {
          path: { id: "ses_1" },
          body: {
            agent: "architect",
            model: { providerID: "anthropic", modelID: "claude" },
            parts: [{ type: "text", text: "continue the mission" }],
          },
          query: { directory: "/tmp/project" },
        },
      },
    ])
  })

  test("omits agent and model when they are unknown", async () => {
    //#given
    const { client, calls } = makeV1Client()
    const steering = createV1SessionSteering(client)

    //#when
    await steering.deliver({ ...BASE, text: "keep going" })

    //#then
    const body = (calls[0]?.args as { body: Record<string, unknown> }).body
    expect(body).toEqual({ parts: [{ type: "text", text: "keep going" }] })
    expect(Object.hasOwn(body, "agent")).toBe(false)
    expect(Object.hasOwn(body, "model")).toBe(false)
  })

  test("reports the v1 runtime", () => {
    //#given
    const { client } = makeV1Client()

    //#when
    const steering = createV1SessionSteering(client)

    //#then
    expect(steering.runtime).toBe("v1")
  })

  test("uses the blocking prompt when the caller must await completion", async () => {
    //#given
    const { client, calls } = makeV1Client()
    const steering = createV1SessionSteering(client)

    //#when
    await steering.deliver({ ...BASE, text: "verify", agent: "oracle", awaitCompletion: true })

    //#then
    expect(calls.map((c) => c.method)).toEqual(["prompt"])
    expect(calls[0]?.args).toEqual({
      path: { id: "ses_1" },
      body: { agent: "oracle", parts: [{ type: "text", text: "verify" }] },
      query: { directory: "/tmp/project" },
    })
  })
})

describe("createV2SessionSteering", () => {
  test("steers the in-flight session with delivery=steer by default", async () => {
    //#given
    const { session, calls } = makeV2Session()
    const steering = createV2SessionSteering(session)

    //#when
    await steering.deliver({ ...BASE, text: "change of plan" })

    //#then
    expect(calls).toEqual([
      { method: "prompt", args: { sessionID: "ses_1", text: "change of plan", delivery: "steer" } },
    ])
  })

  test("queues the prompt when delivery=queue is requested", async () => {
    //#given
    const { session, calls } = makeV2Session()
    const steering = createV2SessionSteering(session)

    //#when
    await steering.deliver({ ...BASE, text: "next task", delivery: "queue" })

    //#then
    expect(calls[0]).toEqual({
      method: "prompt",
      args: { sessionID: "ses_1", text: "next task", delivery: "queue" },
    })
  })

  test("switches agent then model before prompting", async () => {
    //#given
    const { session, calls } = makeV2Session()
    const steering = createV2SessionSteering(session)

    //#when
    await steering.deliver({
      ...BASE,
      text: "resume",
      agent: "morpheus",
      model: { providerID: "opencode", modelID: "big" },
    })

    //#then
    expect(calls.map((c) => c.method)).toEqual(["switchAgent", "switchModel", "prompt"])
    expect(calls[0]?.args).toEqual({ sessionID: "ses_1", agent: "morpheus" })
    expect(calls[1]?.args).toEqual({
      sessionID: "ses_1",
      model: { providerID: "opencode", modelID: "big" },
    })
  })

  test("propagates a transport failure so continuation callers can count it", async () => {
    //#given
    const session = {
      switchAgent: () => Promise.resolve({}),
      switchModel: () => Promise.resolve({}),
      prompt: () => Promise.reject(new Error("steering refused")),
    }

    //#when
    const steering = createV2SessionSteering(session)

    //#then
    await expect(steering.deliver({ ...BASE, text: "x" })).rejects.toThrow("steering refused")
  })

  test("reports the v2 runtime", () => {
    //#given
    const { session } = makeV2Session()

    //#when
    const steering = createV2SessionSteering(session)

    //#then
    expect(steering.runtime).toBe("v2")
  })
})

describe("resolveSessionSteering", () => {
  test("binds the v1 steering port to the SDK client on the current runtime", () => {
    //#given
    const { client } = makeV1Client()

    //#when
    const steering = resolveSessionSteering({ client } as never)

    //#then
    expect(steering.runtime).toBe("v1")
  })
})

describe("resolveSessionOps", () => {
  test("creates a child session with the v1 body/query shape", async () => {
    //#given
    const { calls } = makeV1SessionOpsClient()
    const ops = resolveSessionOps({ client: calls.client } as never)

    //#when
    const result = await ops.create({
      description: "Matrix Loop Verification",
      title: "Matrix Loop Verification",
      agent: "oracle",
      parentSessionID: "ses_parent",
      directory: "/tmp/project",
      subagent: true,
    })

    //#then
    expect(result).toEqual({ ok: true, sessionID: "ses_child" })
    expect(calls.createArgs).toEqual({
      body: { parentID: "ses_parent", title: "Matrix Loop Verification" },
      query: { directory: "/tmp/project" },
    })
  })

  test("surfaces a create failure as an error result instead of throwing", async () => {
    //#given
    const { calls } = makeV1SessionOpsClient({ error: { message: "nope" } })
    const ops = resolveSessionOps({ client: calls.client } as never)

    //#when
    const result = await ops.create({
      description: "Matrix Loop Verification",
      title: "Matrix Loop Verification",
      agent: "oracle",
      parentSessionID: "ses_parent",
      directory: "/tmp/project",
      subagent: true,
    })

    //#then
    expect(result.ok).toBe(false)
  })
})
