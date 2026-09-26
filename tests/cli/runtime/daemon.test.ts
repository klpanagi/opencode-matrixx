/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import type { CliRuntimeClientFactory, CliRuntimeService, CliRuntimeEnv } from "../../../src/cli/runtime/types"
import { connectCliRuntime } from "../../../src/cli/runtime/daemon"

function fakeService(overrides?: Partial<CliRuntimeService>): CliRuntimeService {
  return {
    discover: async () => undefined,
    ensure: async () => ({ url: "http://127.0.0.1:4096" }),
    headers: () => undefined,
    ...overrides,
  }
}

function fakeFactory(seen: { baseUrl?: string }): CliRuntimeClientFactory {
  return (options) => {
    seen.baseUrl = options.baseUrl
    return {
      baseUrl: options.baseUrl,
      probe: async () => "2.0.16",
    } as unknown as ReturnType<CliRuntimeClientFactory>
  }
}

describe("connectCliRuntime", () => {
  test("connects to an already-running daemon without spawning one", async () => {
    //#given
    const service = fakeService({ discover: async () => ({ url: "http://127.0.0.1:1234" }) })
    const seen: { baseUrl?: string } = {}
    let ensured = false
    const env: CliRuntimeEnv = { daemonEndpointAvailable: true, allowDaemonSpawn: true }

    //#when
    const result = await connectCliRuntime({
      env,
      service,
      makeClient: fakeFactory(seen),
      ensure: async () => {
        ensured = true
        return { url: "http://127.0.0.1:9999" }
      },
    })

    //#then
    expect(result.mode).toBe("daemon")
    expect(result.endpoint?.url).toBe("http://127.0.0.1:1234")
    expect(seen.baseUrl).toBe("http://127.0.0.1:1234")
    expect(ensured).toBe(false)
  })

  test("passes authorization headers from the service to the client factory", async () => {
    //#given
    const endpoint = {
      url: "http://127.0.0.1:1234",
      auth: { type: "basic" as const, username: "opencode", password: "secret" },
    }
    const service = fakeService({
      discover: async () => endpoint,
      headers: () => ({ authorization: "Basic b3BlbmNvZGU6c2VjcmV0" }),
    })
    const seen: { baseUrl?: string; authorization?: string } = { baseUrl: undefined }
    const env: CliRuntimeEnv = { daemonEndpointAvailable: true, allowDaemonSpawn: true }

    //#when
    await connectCliRuntime({
      env,
      service,
      makeClient: (options) => {
        seen.baseUrl = options.baseUrl
        seen.authorization = String((options.headers as Record<string, string>)?.authorization)
        return { baseUrl: options.baseUrl } as unknown as ReturnType<CliRuntimeClientFactory>
      },
      ensure: async () => endpoint,
    })

    //#then
    expect(seen.authorization).toBe("Basic b3BlbmNvZGU6c2VjcmV0")
  })

  test("falls back to in-memory when the daemon is unreachable and spawning is disabled", async () => {
    //#given
    const env: CliRuntimeEnv = { daemonEndpointAvailable: true, allowDaemonSpawn: false }

    //#when
    const result = await connectCliRuntime({
      env,
      service: fakeService({
        discover: async () => {
          throw new Error("connection refused")
        },
      }),
      makeClient: () => {
        throw new Error("must not build a daemon client")
      },
      ensure: async () => {
        throw new Error("must not spawn a daemon")
      },
    })

    //#then
    expect(result.mode).toBe("in-memory")
    expect(result.fallbackReason).toBe("connection refused")
  })

  test("falls back to in-memory when spawning the daemon fails", async () => {
    //#given
    const env: CliRuntimeEnv = { daemonEndpointAvailable: false, allowDaemonSpawn: true }

    //#when
    const result = await connectCliRuntime({
      env,
      service: fakeService(),
      makeClient: () => ({ baseUrl: "http://127.0.0.1:4096" }) as unknown as ReturnType<CliRuntimeClientFactory>,
      ensure: async () => {
        throw new Error("opencode not found in PATH")
      },
    })

    //#then
    expect(result.mode).toBe("in-memory")
    expect(result.fallbackReason).toBe("opencode not found in PATH")
  })

  test("reports the decision reason alongside the selected mode", async () => {
    //#given
    const env: CliRuntimeEnv = { daemonEndpointAvailable: false, allowDaemonSpawn: false }

    //#when
    const result = await connectCliRuntime({
      env,
      service: fakeService(),
      makeClient: () => ({ baseUrl: "x" }) as unknown as ReturnType<CliRuntimeClientFactory>,
      ensure: async () => ({ url: "http://127.0.0.1:4096" }),
    })

    //#then
    expect(result.decision.mode).toBe("in-memory")
    expect(result.decision.reason).toBe("spawn-disabled")
  })

  test("falls back to in-memory when the registration file exists but no service answers", async () => {
    //#given
    const env: CliRuntimeEnv = { daemonEndpointAvailable: true, allowDaemonSpawn: true }

    //#when
    const result = await connectCliRuntime({
      env,
      service: fakeService({ discover: async () => undefined }),
      makeClient: () => ({ baseUrl: "x" }) as unknown as ReturnType<CliRuntimeClientFactory>,
      ensure: async () => ({ url: "http://127.0.0.1:4096" }),
    })

    //#then
    expect(result.mode).toBe("in-memory")
    expect(result.decision.reason).toBe("no-endpoint")
    expect(result.fallbackReason).toContain("no daemon endpoint")
  })
})
