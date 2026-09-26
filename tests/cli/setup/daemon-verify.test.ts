/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { verifySyncWithDaemon } from "../../../src/cli/setup/opencode-sync"

function daemonRuntime(plugin: string[] | undefined) {
  return {
    mode: "daemon" as const,
    client: { config: { get: async () => ({ data: plugin === undefined ? {} : { plugin } }) } },
  }
}

describe("verifySyncWithDaemon", () => {
  test("is a no-op when the daemon is not enabled", async () => {
    //#given
    const env = {}
    let created = false

    //#when
    const result = await verifySyncWithDaemon({
      plugins: ["matrixx"],
      env,
      createRuntime: async () => {
        created = true
        return { mode: "in-memory" as const }
      },
    })

    //#then
    expect(result).toBeUndefined()
    expect(created).toBe(false)
  })

  test("reports a match when the running daemon already has the plugins", async () => {
    //#given
    const lines: string[] = []

    //#when
    const result = await verifySyncWithDaemon({
      plugins: ["matrixx"],
      env: { MATRIXX_CLI_DAEMON: "1" },
      createRuntime: async () => daemonRuntime(["matrixx"]),
      log: (m) => lines.push(m),
    })

    //#then
    expect(result?.status).toBe("match")
    expect(lines).toEqual([])
  })

  test("logs and reports a mismatch when the daemon lacks the plugin", async () => {
    //#given
    const lines: string[] = []

    //#when
    const result = await verifySyncWithDaemon({
      plugins: ["matrixx"],
      env: { MATRIXX_CLI_DAEMON: "1" },
      createRuntime: async () => daemonRuntime(["other"]),
      log: (m) => lines.push(m),
    })

    //#then
    expect(result?.status).toBe("mismatch")
    expect(lines.join("\n")).toContain("matrixx")
  })

  test("reports unavailable without claiming success when the daemon cannot be reached", async () => {
    //#given
    const lines: string[] = []

    //#when
    const result = await verifySyncWithDaemon({
      plugins: ["matrixx"],
      env: { MATRIXX_CLI_DAEMON: "1" },
      createRuntime: async () => ({ mode: "in-memory" as const }),
      log: (m) => lines.push(m),
    })

    //#then
    expect(result?.status).toBe("unavailable")
    expect(lines.join("\n")).toContain("not verified")
  })

  test("never claims a match when the daemon omits the plugin list", async () => {
    //#given
    const lines: string[] = []

    //#when
    const result = await verifySyncWithDaemon({
      plugins: ["matrixx"],
      env: { MATRIXX_CLI_DAEMON: "1" },
      createRuntime: async () => daemonRuntime(undefined),
      log: (m) => lines.push(m),
    })

    //#then
    expect(result?.status).toBe("unavailable")
    expect(lines.join("\n")).toContain("not verified")
  })
})
