/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import {
  buildForkRequest,
  buildMoveRequest,
  buildQueuePrompt,
  buildSteerPrompt,
  buildSubagentSessionCreate,
  buildSubagentTitle,
  isSubagentAutoBackground,
  type V1CreateSessionFn,
  type SessionOps,
  type V2SessionSource,
} from "../../../src/features/background-agent/session-ops"
import { createV1SessionOps } from "../../../src/features/background-agent/v1-session-ops"
import { createV2SessionOps } from "../../../src/features/background-agent/v2-session-ops"

function createFakeV2Session() {
  const calls: Array<{ op: string; input: unknown }> = []
  const session: V2SessionSource = {
    create: async (input) => {
      calls.push({ op: "create", input })
      return { id: "ses_child" }
    },
    switchAgent: async (input) => {
      calls.push({ op: "switchAgent", input })
    },
    prompt: async (input) => {
      calls.push({ op: "prompt", input })
    },
    move: async (input) => {
      calls.push({ op: "move", input })
    },
  }
  return { calls, session }
}

function createFakeV1Create(data?: { id?: string }, error?: string) {
  const calls: unknown[] = []
  const create: V1CreateSessionFn = async (args) => {
    calls.push(args)
    return { data, error }
  }
  return { calls, create }
}

const createRequest = buildSubagentSessionCreate({
  description: "Investigate race",
  agent: "sentinel",
  parentSessionID: "ses_parent",
  directory: "/repo",
})

describe("buildSubagentTitle", () => {
  test("marks the session as a subagent session", () => {
    //#given
    const description = "Investigate race"
    const agent = "sentinel"

    //#when
    const title = buildSubagentTitle(description, agent)

    //#then
    expect(title).toBe("Investigate race (@sentinel subagent)")
  })
})

describe("buildSubagentSessionCreate", () => {
  test("carries the subagent auto-background intent and worktree directory", () => {
    //#given
    const request = {
      description: "Investigate race",
      agent: "sentinel",
      parentSessionID: "ses_parent",
      directory: "/repo/.worktrees/wt-1",
    }

    //#when
    const input = buildSubagentSessionCreate(request)

    //#then
    expect(input.title).toBe("Investigate race (@sentinel subagent)")
    expect(input.agent).toBe("sentinel")
    expect(input.directory).toBe("/repo/.worktrees/wt-1")
    expect(input.parentSessionID).toBe("ses_parent")
    expect(input.subagent).toBe(true)
  })
})

describe("isSubagentAutoBackground", () => {
  test("is true only when the launch request opted into subagent mode", () => {
    //#given
    const optedIn = { subagent: true }
    const notOptedIn = { subagent: false }

    //#when
    const opted = isSubagentAutoBackground(optedIn)
    const notOpted = isSubagentAutoBackground(notOptedIn)

    //#then
    expect(opted).toBe(true)
    expect(notOpted).toBe(false)
  })
})

describe("prompt delivery builders", () => {
  test("buildQueuePrompt targets the launch prompt with queue delivery", () => {
    //#given
    const sessionID = "ses_child"

    //#when
    const input = buildQueuePrompt(sessionID, "do the work", "sentinel")

    //#then
    expect(input.sessionID).toBe("ses_child")
    expect(input.text).toBe("do the work")
    expect(input.delivery).toBe("queue")
    expect(input.agent).toBe("sentinel")
  })

  test("buildSteerPrompt uses steer delivery so a running session is interrupted mid-flight", () => {
    //#given
    const sessionID = "ses_child"

    //#when
    const input = buildSteerPrompt(sessionID, "stop, use the worktree instead")

    //#then
    expect(input.delivery).toBe("steer")
    expect(input.agent).toBeUndefined()
  })
})

describe("fork and move request builders", () => {
  test("buildForkRequest points at the parent session and optional boundary message", () => {
    //#given
    const sessionID = "ses_parent"
    const before = "msg_42"

    //#when
    const input = buildForkRequest(sessionID, before)

    //#then
    expect(input).toEqual({ sessionID: "ses_parent", before: "msg_42" })
  })

  test("buildMoveRequest relocates a session to a worktree directory with a delivery mode", () => {
    //#given
    const sessionID = "ses_child"
    const directory = "/repo/.worktrees/wt-2"

    //#when
    const input = buildMoveRequest(sessionID, directory, "steer")

    //#then
    expect(input).toEqual({ sessionID: "ses_child", directory: "/repo/.worktrees/wt-2", delivery: "steer" })
  })
})

describe("createV2SessionOps", () => {
  test("create launches a V2 session and returns its id", async () => {
    //#given
    const fake = createFakeV2Session()
    const ops = createV2SessionOps(fake.session)
    const request = buildSubagentSessionCreate({
      description: "Investigate race",
      agent: "sentinel",
      parentSessionID: "ses_parent",
      directory: "/repo",
    })

    //#when
    const result = await ops.create(request)

    //#then
    expect(result).toEqual({ ok: true, sessionID: "ses_child" })
    expect(fake.calls[0]?.op).toBe("create")
    expect(fake.calls[0]?.input).toMatchObject({
      title: "Investigate race (@sentinel subagent)",
      agent: "sentinel",
      location: { directory: "/repo" },
    })
  })

  test("prompt switches the agent before queueing the prompt", async () => {
    //#given
    const fake = createFakeV2Session()
    const ops = createV2SessionOps(fake.session)

    //#when
    const result = await ops.prompt(buildQueuePrompt("ses_child", "do the work", "oracle"))

    //#then
    expect(result).toEqual({ ok: true })
    expect(fake.calls.map(c => c.op)).toEqual(["switchAgent", "prompt"])
    expect(fake.calls[1]?.input).toMatchObject({
      sessionID: "ses_child",
      text: "do the work",
      delivery: "queue",
    })
  })

  test("prompt without an agent does not call switchAgent", async () => {
    //#given
    const fake = createFakeV2Session()
    const ops = createV2SessionOps(fake.session)

    //#when
    await ops.prompt(buildSteerPrompt("ses_child", "change of plan"))

    //#then
    expect(fake.calls.map(c => c.op)).toEqual(["prompt"])
  })

  test("move relocates the session and carries the delivery mode", async () => {
    //#given
    const fake = createFakeV2Session()
    const ops = createV2SessionOps(fake.session)

    //#when
    const result = await ops.move(buildMoveRequest("ses_child", "/repo/.worktrees/wt-3", "queue"))

    //#then
    expect(result).toEqual({ ok: true })
    expect(fake.calls[0]).toEqual({
      op: "move",
      input: { sessionID: "ses_child", directory: "/repo/.worktrees/wt-3", delivery: "queue" },
    })
  })

  test("fork reports unavailable because the V2 in-plugin SessionDomain has no fork member", async () => {
    //#given
    const fake = createFakeV2Session()
    const ops = createV2SessionOps(fake.session)

    //#when
    const result = await ops.fork?.(buildForkRequest("ses_parent"))

    //#then
    expect(result).toEqual({ ok: false, error: "fork-unavailable-on-v2-session-domain" })
  })

  test("a create failure is surfaced as an error result, never a thrown exception", async () => {
    //#given
    const failing: V2SessionSource = {
      create: async () => {
        throw new Error("boom")
      },
      switchAgent: async () => {},
      prompt: async () => {},
      move: async () => {},
    }
    const ops = createV2SessionOps(failing)
    const request = buildSubagentSessionCreate({
      description: "d",
      agent: "sentinel",
      parentSessionID: "ses_parent",
      directory: "/repo",
    })

    //#when
    const result = await ops.create(request)

    //#then
    expect(result).toEqual({ ok: false, error: "boom" })
  })
})

describe("createV1SessionOps", () => {
  test("create preserves the V1 create body and query shape", async () => {
    //#given
    const fake = createFakeV1Create({ id: "ses_v1" })
    const ops = createV1SessionOps(fake.create)
    const request = buildSubagentSessionCreate({
      description: "Investigate race",
      agent: "sentinel",
      parentSessionID: "ses_parent",
      directory: "/repo",
    })

    //#when
    const result = await ops.create(request)

    //#then
    expect(result).toEqual({ ok: true, sessionID: "ses_v1" })
    expect(fake.calls[0]).toEqual({
      body: { parentID: "ses_parent", title: "Investigate race (@sentinel subagent)" },
      query: { directory: "/repo" },
    })
  })

  test("create maps a missing id to the historical background-session error", async () => {
    //#given
    const fake = createFakeV1Create({})
    const ops = createV1SessionOps(fake.create)
    const request = buildSubagentSessionCreate({
      description: "d",
      agent: "sentinel",
      parentSessionID: "ses_parent",
      directory: "/repo",
    })

    //#when
    const result = await ops.create(request)

    //#then
    expect(result).toEqual({
      ok: false,
      error: "Failed to create background session: API returned no session ID",
    })
  })

  test("create maps a V1 error envelope to a failed result", async () => {
    //#given
    const fake = createFakeV1Create(undefined, "nope")
    const ops = createV1SessionOps(fake.create)

    //#when
    const result = await ops.create(createRequest)

    //#then
    expect(result).toEqual({ ok: false, error: "Failed to create background session: nope" })
  })

  test("a custom error prefix preserves the caller's historical wording", async () => {
    //#given
    const fake = createFakeV1Create(undefined, "nope")
    const ops = createV1SessionOps(fake.create, { createErrorPrefix: "Failed to create session" })

    //#when
    const result = await ops.create(createRequest)

    //#then
    expect(result).toEqual({ ok: false, error: "Failed to create session: nope" })
  })

  test("prompt, fork and move are not claimed by the V1 adapter", async () => {
    //#given
    const fake = createFakeV1Create({ id: "ses_v1" })
    const ops = createV1SessionOps(fake.create)

    //#when
    const prompt = await ops.prompt(buildSteerPrompt("ses_v1", "x"))
    const fork = await ops.fork(buildForkRequest("ses_v1"))
    const move = await ops.move(buildMoveRequest("ses_v1", "/repo", "queue"))

    //#then
    const unsupported: Awaited<ReturnType<SessionOps["prompt"]>> = {
      ok: false,
      error: "operation-not-implemented-by-v1-session-ops",
    }
    expect(prompt).toEqual(unsupported)
    expect(fork).toEqual(unsupported)
    expect(move).toEqual(unsupported)
  })
})
