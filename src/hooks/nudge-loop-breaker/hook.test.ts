/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import type { PluginContext } from "../../plugin/types"
import { createNudgeLoopBreakerHook } from "./hook"
import { computeBackoffDelay } from "./session-state"

const SESSION = "ses_loop"

type Activation = { sessionID: string; backoff: number }

function stepEnded(text: string, sessionID = SESSION) {
  return {
    event: {
      type: "session.next.step.ended",
      properties: { sessionID, assistantMessageID: "msg_x", text },
    },
  }
}

function makeHook() {
  const activations: Activation[] = []
  let clock = 1000
  const hook = createNudgeLoopBreakerHook({} as PluginContext, {
    now: () => clock,
    cooldownMs: 100,
    onCorrective: (sessionID, backoff) => activations.push({ sessionID, backoff }),
  })
  return {
    hook,
    activations,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe("createNudgeLoopBreakerHook — repeated step detection", () => {
  test("activates backoff after three identical step.ended events", async () => {
    //#given
    const { hook, activations } = makeHook()

    //#when
    await hook.event(stepEnded("repeated assistant text"))
    await hook.event(stepEnded("repeated assistant text"))
    const beforeThreshold = activations.length
    await hook.event(stepEnded("repeated assistant text"))

    //#then
    expect(beforeThreshold).toBe(0)
    expect(activations.length).toBe(1)
    expect(activations[0]).toEqual({ sessionID: SESSION, backoff: 1 })
  })

  test("resets the counter when the text changes", async () => {
    //#given
    const { hook, activations } = makeHook()

    //#when
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("different"))
    await hook.event(stepEnded("different"))
    await hook.event(stepEnded("same"))

    //#then
    expect(activations.length).toBe(0)
  })

  test("normalizes fullwidth DSML markers and whitespace before hashing", async () => {
    //#given
    const { hook, activations } = makeHook()

    //#when
    await hook.event(stepEnded("echo </｜DSML｜parameter> now"))
    await hook.event(stepEnded("echo   </DSMLparameter>   now"))
    await hook.event(stepEnded("echo </｜DSML｜parameter> now"))

    //#then
    expect(activations.length).toBe(1)
  })

  test("resets on a completed compress tool success", async () => {
    //#given
    const { hook, activations } = makeHook()

    //#when
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    await hook.event({
      event: { type: "session.next.tool.success", properties: { sessionID: SESSION, tool: "compress" } },
    })
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    const afterReset = activations.length
    await hook.event(stepEnded("same"))

    //#then
    expect(afterReset).toBe(0)
    expect(activations.length).toBe(1)
  })

  test("resets on a new user message", async () => {
    //#given
    const { hook, activations } = makeHook()

    //#when
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    await hook.event({
      event: { type: "message.updated", properties: { sessionID: SESSION, info: { role: "user" } } },
    })
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    const afterReset = activations.length
    await hook.event(stepEnded("same"))

    //#then
    expect(afterReset).toBe(0)
    expect(activations.length).toBe(1)
  })
})

describe("nudge-loop-breaker backoff math", () => {
  test("computes exponential delays capped at 2^5", () => {
    //#given
    const counts = [3, 4, 5, 6, 7, 8, 9]

    //#when
    const delays = counts.map((count) => computeBackoffDelay(count, 3))

    //#then
    expect(delays).toEqual([1, 2, 4, 8, 16, 32, 32])
  })

  test("returns zero below the threshold", () => {
    //#given
    //#when
    const delays = [1, 2].map((count) => computeBackoffDelay(count, 3))

    //#then
    expect(delays).toEqual([0, 0])
  })
})

describe("nudge-loop-breaker cooldown", () => {
  test("does not re-activate within the cooldown window", async () => {
    //#given
    const { hook, activations, advance } = makeHook()
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))
    await hook.event(stepEnded("same"))

    //#when
    await hook.event(stepEnded("same"))
    const withinCooldown = activations.length
    advance(200)
    await hook.event(stepEnded("same"))

    //#then
    expect(withinCooldown).toBe(1)
    expect(activations.length).toBe(2)
    expect(activations[1].backoff).toBe(4)
  })
})
