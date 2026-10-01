import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { findFirstMessageWithAgentFromSDK, findNearestMessageWithFieldsFromSDK } from "../../src/features/hook-message-injector"
import { invalidateSdkMessageCache } from "../../src/features/hook-message-injector/sdk-message-cache"
import type { OpencodeClient } from "../../src/features/hook-message-injector/injector"
import { _resetMissionStateCacheForTesting, readMissionState } from "../../src/features/mission-state/storage"

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

describe("readMissionState cache", () => {
  const dir = join(import.meta.dir, "mission-cache-fixture")
  const missionDir = join(dir, ".matrixx")

  beforeEach(() => {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(missionDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function write(agent: string) {
    writeFileSync(join(missionDir, "mission.json"), JSON.stringify({ agent, session_ids: ["ses_1"] }))
  }

  //#given a mission file on disk
  //#when readMissionState is called twice
  //#then both calls observe the same parsed state
  it("returns equivalent state across repeat reads", async () => {
    write("architect")

    const first = readMissionState(dir)
    const second = readMissionState(dir)

    expect(first?.agent).toBe("architect")
    expect(second?.agent).toBe("architect")
  })

  //#given a cached mission state
  //#when the file content changes on disk
  //#then the new content is observed
  it("observes file changes", async () => {
    write("architect")
    expect(readMissionState(dir)?.agent).toBe("architect")

    write("oracle")
    expect(readMissionState(dir)?.agent).toBe("oracle")
  })

  //#given a cached mission state handed to a caller
  //#when the caller mutates session_ids in place
  //#then the cached copy is unaffected
  it("does not leak caller mutations into the cache", async () => {
    const { readMissionState, _resetMissionStateCacheForTesting } = await import(
      "../../src/features/mission-state/storage"
    )
    _resetMissionStateCacheForTesting()
    write("architect")

    const first = readMissionState(dir)
    first?.session_ids?.push("ses_mutated")

    expect(readMissionState(dir)?.session_ids).toEqual(["ses_1"])
  })

  //#given no mission file
  //#when readMissionState is called
  //#then it returns null
  it("returns null when the mission file is absent", async () => {
    const { readMissionState, _resetMissionStateCacheForTesting } = await import(
      "../../src/features/mission-state/storage"
    )
    _resetMissionStateCacheForTesting()
    rmSync(join(missionDir, "mission.json"), { force: true })

    expect(readMissionState(dir)).toBeNull()
  })
})
