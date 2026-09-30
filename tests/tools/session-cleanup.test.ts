import { beforeEach, describe, expect, it } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { MatrixxConfigSchema } from "../../src/config"
import { shouldEnableSessionCleanup } from "../../src/plugin/tool-gating"
import { createSessionCleanupTool } from "../../src/tools/session-cleanup"

//#given A mock SDK client that records every session.list and session.delete call
type MockSession = {
  id: string
  title: string
  directory: string
  parentID?: string
}

type Tracker = {
  listed: number
  deleted: string[]
  client: unknown
}

function createTracker(sessions: MockSession[], deleteFails?: (id: string) => boolean): Tracker {
  const tracker: Tracker = { listed: 0, deleted: [], client: null }
  tracker.client = {
    session: {
      list: async () => {
        tracker.listed += 1
        return { data: sessions }
      },
      delete: async (opts: { path: { id: string }; query?: { directory?: string } }) => {
        if (deleteFails?.(opts.path.id)) {
          return { error: "delete exploded" }
        }
        tracker.deleted.push(opts.path.id)
        return { data: true }
      },
    },
  }
  return tracker
}

function createCtx(client: unknown, directory = "/home/klpanagi/matrixx"): PluginInput {
  return { client, directory } as unknown as PluginInput
}

async function run(
  client: unknown,
  args: Record<string, unknown> = {},
  directory?: string,
): Promise<string> {
  const tool = createSessionCleanupTool(createCtx(client, directory))
  return await tool.execute(args, {} as never)
}

describe("session_cleanup tool", () => {
  beforeEach(() => {
    // no shared state; each test builds its own tracker
  })

  //#given only parentless evolution-compressor sessions are leaked
  //#when the tool runs a dry run
  //#then nothing is deleted and the count is reported
  it("dry run reports matches without deleting", async () => {
    const tracker = createTracker([
      { id: "s1", title: "evolution-compressor", directory: "/proj" },
      { id: "s2", title: "evolution-compressor", directory: "/proj" },
    ])
    const output = await run(tracker.client)
    expect(tracker.deleted).toEqual([])
    expect(tracker.listed).toBe(1)
    expect(output).toContain("2")
  })

  //#given a dry run found matches
  //#when apply=true is passed
  //#then every matched session is deleted
  it("apply deletes matched sessions", async () => {
    const tracker = createTracker([
      { id: "s1", title: "evolution-compressor", directory: "/proj" },
      { id: "s2", title: "evolution-compressor", directory: "/proj" },
    ])
    const output = await run(tracker.client, { apply: true })
    expect(tracker.deleted).toEqual(["s1", "s2"])
    expect(output).toContain("Deleted 2")
  })

  //#given child sessions that the TUI already hides
  //#when the tool scans
  //#then they are never matched, because they are not visible clutter
  it("never matches sessions that have a parentID", async () => {
    const tracker = createTracker([
      { id: "child", title: "evolution-compressor", directory: "/proj", parentID: "parent-1" },
    ])
    const output = await run(tracker.client, { apply: true })
    expect(tracker.deleted).toEqual([])
    expect(output).toContain("No leaked sessions")
  })

  //#given unrelated titles, including a look_at session
  //#when the tool scans
  //#then look_at is skipped unless explicitly opted in
  it("ignores look_at sessions unless include_look_at is set", async () => {
    const tracker = createTracker([
      { id: "la", title: "look_at: some doc", directory: "/proj" },
      { id: "user", title: "Pickup handoff context loading", directory: "/proj" },
    ])
    const output = await run(tracker.client, { apply: true })
    expect(tracker.deleted).toEqual([])
    expect(output).toContain("No leaked sessions")

    const tracker2 = createTracker([{ id: "la", title: "look_at: some doc", directory: "/proj" }])
    await run(tracker2.client, { apply: true, include_look_at: true })
    expect(tracker2.deleted).toEqual(["la"])
  })

  //#given sessions spanning several project directories
  //#when a match is deleted
  //#then its own directory is sent as the query so the server resolves the right project
  it("deletes using each session's own directory", async () => {
    const seenDirectories: Array<string | undefined> = []
    const client = {
      session: {
        list: async () => ({ data: [{ id: "s1", title: "evolution-compressor", directory: "/other" }] }),
        delete: async (opts: { query?: { directory?: string } }) => {
          seenDirectories.push(opts.query?.directory)
          return { data: true }
        },
      },
    }
    await run(client, { apply: true })
    expect(seenDirectories).toEqual(["/other"])
  })

  //#given the list call fails because the server is unreachable
  //#when the tool runs
  //#then the failure surfaces instead of degrading to a misleading "nothing found"
  it("surfaces a connection failure instead of reporting zero matches", async () => {
    const client = {
      session: {
        list: async () => {
          throw new TypeError("Unable to connect. Is the computer able to access the url?")
        },
        delete: async () => ({ data: true }),
      },
    }
    const output = await run(client, { apply: true })
    expect(output).toContain("Error")
    expect(output).toContain("Unable to connect")
    expect(output).not.toContain("No leaked sessions")
  })

  //#given some deletes fail
  //#when the tool finishes
  //#then the failure is reported and the tally reflects what actually happened
  it("reports partial failures without claiming full success", async () => {
    const tracker = createTracker(
      [
        { id: "s1", title: "evolution-compressor", directory: "/proj" },
        { id: "s2", title: "evolution-compressor", directory: "/proj" },
      ],
      id => id === "s2",
    )
    const output = await run(tracker.client, { apply: true })
    expect(tracker.deleted).toEqual(["s1"])
    expect(output).toContain("Deleted 1")
    expect(output).toContain("failed")
  })

  //#given a session already removed by the time we delete it
  //#when the server returns a 404
  //#then it is treated as already-clean rather than a failure
  it("treats 404 on delete as already cleaned", async () => {
    const client = {
      session: {
        list: async () => ({ data: [{ id: "gone", title: "evolution-compressor", directory: "/proj" }] }),
        delete: async () => ({ error: "404 Not Found" }),
      },
    }
    const output = await run(client, { apply: true })
    expect(output).toContain("Deleted 1")
    expect(output).not.toContain("failed")
  })

  //#given a raw config carrying tool_gating.session_cleanup
  //#when it is parsed by the real config schema and read by the real gate
  //#then the flag survives, so the tool is actually reachable after a restart
  it("config key reaches the gate through the real schema", () => {
    const parsed = MatrixxConfigSchema.parse({ tool_gating: { session_cleanup: true } })
    expect(shouldEnableSessionCleanup(parsed.tool_gating?.session_cleanup)).toBe(true)
  })

  //#given a config that never mentions the key
  //#when it flows through the real schema and gate
  //#then the destructive tool stays unregistered by default
  it("stays unregistered when the config omits the key", () => {
    const parsed = MatrixxConfigSchema.parse({})
    expect(shouldEnableSessionCleanup(parsed.tool_gating?.session_cleanup)).toBe(false)
  })
})