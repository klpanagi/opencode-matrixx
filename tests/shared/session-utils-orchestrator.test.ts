import { afterEach, describe, expect, it } from "bun:test"
import type { OpencodeClient } from "../../src/features/hook-message-injector/injector"
import { invalidateSdkMessageCache } from "../../src/features/hook-message-injector/sdk-message-cache"
import { _resetForTesting, setSessionAgent } from "../../src/features/session-state"
import { isCallerOrchestrator } from "../../src/shared/session-utils"

function makeClient(agent: string) {
  let calls = 0
  const client = {
    session: {
      messages: async () => {
        calls++
        return { data: [{ info: { id: "m1", agent } }] }
      },
    },
  }
  return { client: client as unknown as OpencodeClient, getCalls: () => calls }
}

describe("isCallerOrchestrator", () => {
  afterEach(() => {
    _resetForTesting()
    invalidateSdkMessageCache()
  })

  //#given no sessionID
  //#when the orchestrator check runs
  //then it returns false without querying the SDK
  it("returns false for a missing sessionID", async () => {
    const { client, getCalls } = makeClient("architect")

    expect(await isCallerOrchestrator(undefined, client)).toBe(false)
    expect(getCalls()).toBe(0)
  })

  //#given the in-memory session agent is known to be a non-architect agent
  //#when the orchestrator check runs
  //#then it resolves from memory without issuing a transcript fetch
  it("short-circuits on the in-memory agent for a non-architect session", async () => {
    const { client, getCalls } = makeClient("architect")
    setSessionAgent("ses_short", "oracle")

    expect(await isCallerOrchestrator("ses_short", client)).toBe(false)
    expect(getCalls()).toBe(0)
  })

  //#given the in-memory session agent is the architect
  //#when the orchestrator check runs
  //then it returns true without issuing a transcript fetch
  it("short-circuits on the in-memory agent for an architect session", async () => {
    const { client, getCalls } = makeClient("oracle")
    setSessionAgent("ses_arch", "architect")

    expect(await isCallerOrchestrator("ses_arch", client)).toBe(true)
    expect(getCalls()).toBe(0)
  })
})
