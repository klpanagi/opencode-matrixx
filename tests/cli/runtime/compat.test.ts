/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { defaultCliService, defaultDaemonClientFactory } from "../../../src/cli/runtime/defaults"
import { createInMemoryRuntime } from "../../../src/cli/runtime/in-memory"
import { verifyPluginsWithDaemon } from "../../../src/cli/runtime/verify"

const CLI_ENTRY = join(import.meta.dir, "..", "..", "..", "src", "cli", "index.ts")

function runCli(args: string[]): { code: number; out: string } {
  const proc = Bun.spawnSync(["bun", "run", CLI_ENTRY, ...args], { stdout: "pipe", stderr: "pipe" })
  return { code: proc.exitCode, out: `${proc.stdout.toString()}${proc.stderr.toString()}` }
}

describe("CLI compatibility surface", () => {
  test("the help subcommand exits 0 and still documents every pre-existing flag", () => {
    //#given
    const flags = [
      "--help",
      "-h",
      "--json",
      "--category",
      "--no-tui",
      "--local",
      "--verbose",
      "--yes",
      "-y",
      "--dry-run",
      "--skip-presets",
      "--claude=",
      "--openai=",
      "--gemini=",
      "--copilot=",
      "--opencode-zen=",
      "--zai-coding-plan=",
    ]

    //#when
    const result = runCli(["help"])

    //#then
    expect(result.code).toBe(0)
    for (const flag of flags) {
      expect(result.out).toContain(flag)
    }
  })

  test("--help keeps the doctor and setup commands listed", () => {
    //#given
    const args = ["--help"]

    //#when
    const result = runCli(args)

    //#then
    expect(result.out).toContain("doctor")
    expect(result.out).toContain("setup")
    expect(result.out).toContain("install")
    expect(result.out).toContain("version")
  })

  test("the help subcommand exits 0", () => {
    //#given
    const args = ["help"]

    //#when
    const result = runCli(args)

    //#then
    expect(result.code).toBe(0)
    expect(result.out).toContain("Usage:")
  })

  test("version prints the package version and exits 0", () => {
    //#given
    const args = ["version"]

    //#when
    const result = runCli(args)

    //#then
    expect(result.code).toBe(0)
    expect(result.out.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  test("an unknown command exits 1", () => {
    //#given
    const args = ["definitely-not-a-command"]

    //#when
    const result = runCli(args)

    //#then
    expect(result.code).toBe(1)
    expect(result.out).toContain("Unknown command")
  })
})

describe("runtime defaults", () => {
  test("the default service exposes the daemon lifecycle operations", () => {
    //#given
    const service = defaultCliService

    //#when
    const keys = Object.keys(service).sort()

    //#then
    expect(keys).toEqual(["discover", "ensure", "headers"])
    expect(typeof service.discover).toBe("function")
    expect(typeof service.ensure).toBe("function")
    expect(typeof service.headers).toBe("function")
  })

  test("the default daemon client factory builds a V2 client from a base URL", () => {
    //#given
    const factory = defaultDaemonClientFactory

    //#when
    const client = factory({ baseUrl: "http://127.0.0.1:4096" })

    //#then
    expect(typeof client.session.create).toBe("function")
    expect(typeof client.session.prompt).toBe("function")
    expect(typeof client.server.info).toBe("function")
  })

  test("the in-memory factory is exported from a module outside the CLI entry graph", () => {
    //#given
    const factory = createInMemoryRuntime

    //#then
    expect(typeof factory).toBe("function")
  })
})

describe("verifyPluginsWithDaemon", () => {
  test("reports a mismatch when the daemon reports a different plugin list", async () => {
    //#given
    const runtime = {
      mode: "daemon" as const,
      client: { config: { get: async () => ({ data: { plugin: ["other"] } }) } },
    }

    //#when
    const result = await verifyPluginsWithDaemon(runtime, ["matrixx"])

    //#then
    expect(result.status).toBe("mismatch")
    expect(result.reported).toEqual(["other"])
  })

  test("reports a match when the daemon reports the same plugin list", async () => {
    //#given
    const runtime = {
      mode: "daemon" as const,
      client: { config: { get: async () => ({ data: { plugin: ["matrixx", "other"] } }) } },
    }

    //#when
    const result = await verifyPluginsWithDaemon(runtime, ["matrixx", "other"])

    //#then
    expect(result.status).toBe("match")
  })

  test("reports unavailable instead of ok when the daemon cannot answer", async () => {
    //#given
    const runtime = {
      mode: "daemon" as const,
      client: {
        config: {
          get: async () => {
            throw new Error("timeout")
          },
        },
      },
    }

    //#when
    const result = await verifyPluginsWithDaemon(runtime, ["matrixx"])

    //#then
    expect(result.status).toBe("unavailable")
    expect(result.detail).toContain("timeout")
  })

  test("reports unavailable for an in-memory runtime without contacting anything", async () => {
    //#given
    const runtime = { mode: "in-memory" as const }

    //#when
    const result = await verifyPluginsWithDaemon(runtime, ["matrixx"])

    //#then
    expect(result.status).toBe("unavailable")
    expect(result.detail).toContain("in-memory")
  })
})
