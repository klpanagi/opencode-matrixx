import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { findFirstMessageWithAgentFromSDK, findNearestMessageWithFieldsFromSDK } from "../../src/features/hook-message-injector"
import { invalidateSdkMessageCache } from "../../src/features/hook-message-injector/sdk-message-cache"
import type { OpencodeClient } from "../../src/features/hook-message-injector/injector"

function makeClient(payload: unknown) {
  let calls = 0
  const client = {
    session: {
      messages: async () => {
        calls++
        return payload
      },
    },
  }
  return { client: client as unknown as OpencodeClient, getCalls: () => calls }
}

describe("sdk transcript cache", () => {
  beforeEach(() => {
    invalidateSdkMessageCache()
  })

  afterEach(() => {
    invalidateSdkMessageCache()
  })

  //#given a session whose transcript contains one fully-populated message
  //#when findNearestMessageWithFieldsFromSDK is called repeatedly
  //#then the SDK is queried once and later calls are served from cache
  it("collapses repeated nearest-message lookups into a single fetch", async () => {
    const { client, getCalls } = makeClient({
      data: [{ info: { id: "m1", agent: "oracle", model: { providerID: "p", modelID: "m" } } }],
    })

    const first = await findNearestMessageWithFieldsFromSDK(client, "ses_a")
    const second = await findNearestMessageWithFieldsFromSDK(client, "ses_a")

    expect(first?.agent).toBe("oracle")
    expect(second?.agent).toBe("oracle")
    expect(getCalls()).toBe(1)
  })

  //#given two different lookups against the same session
  //#when both are performed within the cache window
  //#then the shared fetch is reused instead of issued twice
  it("serves the first-message lookup from the same fetch as the nearest lookup", async () => {
    const { client, getCalls } = makeClient({
      data: [{ info: { id: "m1", agent: "oracle" } }],
    })

    await findNearestMessageWithFieldsFromSDK(client, "ses_b")
    const agent = await findFirstMessageWithAgentFromSDK(client, "ses_b")

    expect(agent).toBe("oracle")
    expect(getCalls()).toBe(1)
  })

  //#given cached entries for one session
  //#when a different session is queried
  //#then that session is fetched independently
  it("keys entries per sessionID", async () => {
    const { client, getCalls } = makeClient({
      data: [{ info: { id: "m1", agent: "oracle" } }],
    })

    await findNearestMessageWithFieldsFromSDK(client, "ses_1")
    await findNearestMessageWithFieldsFromSDK(client, "ses_2")
    await findNearestMessageWithFieldsFromSDK(client, "ses_1")

    expect(getCalls()).toBe(2)
  })

  //#given a cached entry for a session
  //#when the cache is invalidated for that session
  //#then the next lookup refetches
  it("refetches after explicit invalidation", async () => {
    const { client, getCalls } = makeClient({
      data: [{ info: { id: "m1", agent: "oracle" } }],
    })

    await findNearestMessageWithFieldsFromSDK(client, "ses_c")
    invalidateSdkMessageCache("ses_c")
    await findNearestMessageWithFieldsFromSDK(client, "ses_c")

    expect(getCalls()).toBe(2)
  })

  //#given a failing SDK call
  //#when the lookup runs
  //#then it degrades to null rather than throwing, and a failure is not cached
  it("returns null on SDK error without caching the failure", async () => {
    let calls = 0
    const client = {
      session: {
        messages: async () => {
          calls++
          throw new Error("boom")
        },
      },
    } as unknown as OpencodeClient

    const first = await findNearestMessageWithFieldsFromSDK(client, "ses_d")
    const second = await findNearestMessageWithFieldsFromSDK(client, "ses_d")

    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(calls).toBe(2)
  })
})
