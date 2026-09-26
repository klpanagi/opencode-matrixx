/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { V2_CAPABILITY_GAPS, listV2CapabilityGaps, totalGapCallSites } from "../../../../src/plugin/v2/shim/capability-gaps"
import { toV1MessageEnvelope } from "../../../../src/plugin/v2/shim/message-envelope"
import { V2ShimProtocolError, expectCollection, unwrapV2Data } from "../../../../src/plugin/v2/shim/protocol"
import { createV2BackedClient } from "../../../../src/plugin/v2/shim/v2-client-shim"

/**
 * Scope of these tests, stated up front because the previous adapter's 54 tests
 * all passed against fakes while the real behaviour was broken.
 *
 * What is tested HERE: the V1<->V2 mapping logic, the loud-failure guarantees,
 * and the gap registry. These are pure functions of their inputs and are fully
 * determined by the published `@opencode/client` type surface.
 *
 * What is NOT tested here, and must not be inferred from these tests: whether a
 * V2 route exists. That is established only by `script/v2-docker-smoke.sh` against
 * a live V2 server, and the result is recorded in `docs/v2-smoke.md`. A green run
 * of this file says nothing about route availability.
 */

/** The one V2 message shape actually observed against a live V2 server. */
const OBSERVED_IDLE_MESSAGE = {
  id: "msg_0dd5db2c1001dsFw46fcPzU0t5",
  time: { created: 1790420300481 },
  type: "idle",
  outcome: "failed",
}

const DIRECTORY = "/work/project"

function fakeV2Client(overrides: Record<string, unknown> = {}) {
  return {
    message: { list: async () => [OBSERVED_IDLE_MESSAGE] },
    session: {
      context: async () => [OBSERVED_IDLE_MESSAGE],
      list: async () => [],
      create: async () => ({ id: "ses_new" }),
      get: async () => ({ id: "ses_x" }),
      remove: async () => undefined,
      active: async () => ({ ses_x: { type: "running" } }),
      prompt: async () => ({ id: "inbox_1" }),
      interrupt: async () => undefined,
      compact: async () => undefined,
    },
    model: { list: async () => [] },
    provider: { list: async () => [] },
    config: { get: async () => [] },
    command: { list: async () => [] },
    agent: { list: async () => [] },
    ...overrides,
  } as never
}

function shim(overrides: Record<string, unknown> = {}) {
  return createV2BackedClient(fakeV2Client(overrides), { directory: DIRECTORY })
}

describe("message envelope (GAP-10)", () => {
  test("wraps an observed V2 idle message in the V1 {info, parts} envelope", () => {
    //#given the V2 message shape the Docker probe actually observed
    const messages = [OBSERVED_IDLE_MESSAGE]

    //#when
    const result = toV1MessageEnvelope(messages)

    //#then it carries the V1 envelope consumers read
    expect(result).toHaveLength(1)
    expect(result[0]?.info?.id).toBe("msg_0dd5db2c1001dsFw46fcPzU0t5")
    expect(result[0]?.parts).toEqual([])
  })

  test("maps a declared assistant message content array onto V1 parts", () => {
    //#given a V2 assistant message as declared by SessionMessageAssistant
    const messages = [
      {
        id: "msg_1",
        time: { created: 1 },
        type: "assistant",
        agent: "build",
        model: { id: "m", providerID: "p" },
        content: [
          { type: "text", text: "hello" },
          { type: "reasoning", text: "thinking" },
          { type: "tool", id: "t1", name: "bash", state: { status: "completed" } },
        ],
      },
    ]

    //#when
    const result = toV1MessageEnvelope(messages)

    //#then role and part discriminants match what session-output.ts checks
    expect(result[0]?.info?.role).toBe("assistant")
    expect(result[0]?.parts?.map((p) => p.type)).toEqual(["text", "reasoning", "tool"])
    expect(result[0]?.parts?.[0]?.text).toBe("hello")
  })

  test("maps a declared user message text field onto a text part", () => {
    //#given a V2 user message as declared by SessionMessageUser
    const messages = [{ id: "msg_2", time: { created: 1 }, type: "user", text: "hi" }]

    //#when
    const result = toV1MessageEnvelope(messages)

    //#then
    expect(result[0]?.info?.role).toBe("user")
    expect(result[0]?.parts).toEqual([{ type: "text", text: "hi" }])
  })

  test("throws rather than dropping a message whose V2 type it does not recognise", () => {
    //#given a message type outside the declared V2 union
    const messages = [{ id: "msg_3", time: { created: 1 }, type: "brand-new-variant" }]

    //#when / #then the divergence surfaces instead of shortening history silently
    expect(() => toV1MessageEnvelope(messages)).toThrow(V2ShimProtocolError)
  })

  test("throws when the payload is not an array of messages", () => {
    //#given a non-array payload, e.g. an SPA body that parsed as an object
    //#when / #then
    expect(() => toV1MessageEnvelope({ data: "not messages" })).toThrow(V2ShimProtocolError)
  })
})

describe("loud failure on non-API responses", () => {
  const htmlResponse = (body: string) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" } })

  test("throws when V2 answers a mapped route with its SPA", async () => {
    //#given a 200 response whose body is the V2 SPA, the failure that refuted the V1 client
    const response = htmlResponse("<!doctype html><html lang=\"en\"></html>")

    //#when / #then it is an error, never an empty list
    await expect(unwrapV2Data("session.messages", response)).rejects.toThrow(V2ShimProtocolError)
  })

  test("names the SPA trap in the error so the cause is not mistaken for empty data", async () => {
    //#given an SPA response
    const response = htmlResponse("<!doctype html><html></html>")

    //#when
    const error = await unwrapV2Data("session.messages", response).catch((e: unknown) => e)

    //#then the message explains that HTTP 200 does not mean the route exists
    expect(error).toBeInstanceOf(V2ShimProtocolError)
    expect(String(error)).toContain("SPA")
    expect(String(error)).toContain("session.messages")
  })

  test("throws when a JSON content-type carries an unparseable body", async () => {
    //#given a body that claims JSON but is truncated
    const response = new Response("{oops", { status: 200, headers: { "content-type": "application/json" } })

    //#when / #then
    await expect(unwrapV2Data("model.list", response)).rejects.toThrow(V2ShimProtocolError)
  })

  test("unwraps the data envelope a working route returns", async () => {
    //#given a real JSON response
    const response = new Response(JSON.stringify({ data: [{ id: "a" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })

    //#when
    const result = await unwrapV2Data<{ id: string }[]>("model.list", response)

    //#then
    expect(result).toEqual([{ id: "a" }])
  })

  test("expectCollection rejects a non-array instead of returning empty", () => {
    //#given a route that answered with a non-array where a list was required
    //#when / #then
    expect(() => expectCollection("provider.list", { nope: true }, "test")).toThrow(V2ShimProtocolError)
  })
})

describe("unavailable members", () => {
  test("session.todo rejects with a greppable reason instead of returning an empty list", async () => {
    //#given the shim, where V2 has no todo route
    const client = shim()

    //#when
    const error = await client.session.todo({ path: { id: "ses_x" } }).catch((e: unknown) => e)

    //#then it fails loudly, and never masquerades as "no todos"
    expect(error).toBeInstanceOf(V2ShimProtocolError)
    expect(String(error)).toContain("session.todo")
    expect(String(error)).toContain("404")
  })

  test("tui.showToast resolves as a logged no-op because a toast carries no data", async () => {
    //#given the shim, where V2 has no tui domain
    const client = shim()

    //#when
    const result = await client.tui.showToast({ body: { message: "hello", variant: "info" } })

    //#then it resolves rather than throwing
    expect(result).toBeUndefined()
  })

  test("session.revert rejects loudly because the live V2 server 404s its route", async () => {
    //#given the shim, where POST /api/session/{id}/revert answered 404
    const client = shim()

    //#when
    const error = await client.session.revert({ path: { id: "ses_x" } }).catch((e: unknown) => e)

    //#then it fails loudly rather than pretending the session was reverted
    expect(error).toBeInstanceOf(V2ShimProtocolError)
    expect(String(error)).toContain("session.revert")
  })

  test("every known gap is enumerable and cites its probe evidence", () => {
    //#given the gap registry
    const gaps = listV2CapabilityGaps()

    //#then every established gap is present with checkable evidence
    expect(gaps.map((g) => g.member).sort()).toEqual(["session.revert", "session.todo", "tui.showToast"])
    for (const gap of gaps) {
      expect(gap.probeEvidence.length).toBeGreaterThan(0)
      expect(gap.reason.length).toBeGreaterThan(0)
    }
    expect(totalGapCallSites()).toBe(27)
  })
})

describe("mapped member translation", () => {
  test("session.messages reads the V2 message route and returns the V1 envelope", async () => {
    //#given a V2 client whose message route returns the observed payload
    const client = shim()

    //#when
    const result = await client.session.messages({ path: { id: "ses_x" } })

    //#then the caller receives the V1 envelope, not a raw V2 array
    expect(Array.isArray(result)).toBe(true)
    expect((result as { info?: unknown }[])[0]?.info).toBeDefined()
  })

  test("session.status converts V2 running state into the V1 status map", async () => {
    //#given a V2 active map with one running session
    const client = shim()

    //#when
    const result = await client.session.status()

    //#then callers see the V1 status vocabulary keyed by session id
    expect(result).toEqual({ ses_x: "busy" })
  })

  test("config.get merges V2 config sources into the resolved config callers expect", async () => {
    //#given the V2 config shape observed from the probe: a list of sources
    const client = shim({
      config: {
        get: async () => [
          { type: "directory", path: "/root/.config/opencode" },
          { type: "document", path: "/work/project/opencode.json", info: { plugins: ["a"], model: "m1" } },
        ],
      },
    })

    //#when
    const result = await client.config.get()

    //#then the resolved config object is returned, not the source list
    expect(result).toEqual({ plugins: ["a"], model: "m1" })
  })

  test("session.prompt translates the V1 parts body into the V2 flat text argument", async () => {
    //#given a recording V2 client
    const calls: unknown[] = []
    const client = shim({
      session: {
        prompt: async (args: unknown) => {
          calls.push(args)
          return { id: "inbox_1" }
        },
      },
    })

    //#when a V1-shaped prompt is sent
    await client.session.prompt({ path: { id: "ses_x" }, body: { parts: [{ type: "text", text: "do it" }] } })

    //#then V2 receives flat text
    expect(calls[0]).toEqual({ sessionID: "ses_x", text: "do it" })
  })

  test("session.abort targets the probed V2 interrupt route", async () => {
    //#given a recording V2 client
    const calls: unknown[] = []
    const client = shim({
      session: {
        interrupt: async (args: unknown) => {
          calls.push(args)
        },
      },
    })

    //#when
    await client.session.abort({ path: { id: "ses_x" } })

    //#then
    expect(calls[0]).toEqual({ sessionID: "ses_x" })
  })

  test("a member call with no session id fails loudly rather than requesting a bad route", async () => {
    //#given a call site that forgot the path argument
    const client = shim()

    //#when / #then
    await expect(client.session.get({} as { path: { id: string } })).rejects.toThrow(V2ShimProtocolError)
  })
})

describe("gap registry completeness", () => {
  test("no gap is registered without a member name that is greppable", () => {
    //#given the registry
    //#then every entry names a dotted V1 member
    for (const gap of V2_CAPABILITY_GAPS) {
      expect(gap.member).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    }
  })
})
