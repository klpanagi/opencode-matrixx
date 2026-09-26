/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createCliRuntime } from "../../../src/cli/runtime"

describe("createCliRuntime", () => {
  test("prefers the daemon when the caller opted in and an endpoint exists", async () => {
    //#given
    const created = { closed: false }

    //#when
    const runtime = await createCliRuntime({
      allowDaemonSpawn: true,
      probe: async () => true,
      service: {
        discover: async () => ({ url: "http://127.0.0.1:4444" }),
        ensure: async () => ({ url: "http://127.0.0.1:4444" }),
        headers: () => undefined,
      },
      makeClient: () =>
        ({
          session: { create: async () => ({}), prompt: async () => ({}) },
          server: { info: async () => ({}) },
          config: { get: async () => ({ data: {} }) },
        }) as never,
      createInMemory: async () => {
        throw new Error("must not fall back to in-memory when the daemon answers")
      },
    })

    //#then
    expect(runtime.mode).toBe("daemon")
    expect(runtime.endpoint?.url).toBe("http://127.0.0.1:4444")
    expect(created.closed).toBe(false)
  })

  test("falls back to the in-memory runtime when the daemon is unreachable", async () => {
    //#given
    let closed = false

    //#when
    const runtime = await createCliRuntime({
      allowDaemonSpawn: false,
      probe: async () => true,
      service: {
        discover: async () => {
          throw new Error("ECONNREFUSED")
        },
        ensure: async () => {
          throw new Error("should not spawn")
        },
        headers: () => undefined,
      },
      makeClient: () => {
        throw new Error("no client should be built")
      },
      createInMemory: async () => ({
        mode: "in-memory" as const,
        client: {},
        server: {
          url: "http://127.0.0.1:5555",
          close: () => {
            closed = true
          },
        },
      }),
    })

    //#then
    expect(runtime.mode).toBe("in-memory")
    expect(runtime.fallbackReason).toBe("ECONNREFUSED")
    expect(runtime.inMemory?.server.url).toBe("http://127.0.0.1:5555")
    expect(closed).toBe(false)
  })

  test("never contacts the daemon when the probe reports no registration file", async () => {
    //#given
    let discovered = false

    //#when
    const runtime = await createCliRuntime({
      allowDaemonSpawn: false,
      probe: async () => false,
      service: {
        discover: async () => {
          discovered = true
          return { url: "http://127.0.0.1:6666" }
        },
        ensure: async () => {
          throw new Error("must not spawn a daemon")
        },
        headers: () => undefined,
      },
      makeClient: () => {
        throw new Error("no client should be built")
      },
      createInMemory: async () => ({ mode: "in-memory" as const, client: {}, server: { url: "mem", close: () => {} } }),
    })

    //#then
    expect(runtime.mode).toBe("in-memory")
    expect(runtime.decision.reason).toBe("spawn-disabled")
    expect(discovered).toBe(false)
  })
})
