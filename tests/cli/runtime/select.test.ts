/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { resolveRuntimeEnv, selectCliRuntime } from "../../../src/cli/runtime/select"

describe("selectCliRuntime", () => {
  describe("daemon selection", () => {
    test("uses the daemon without spawning when an endpoint is already registered", () => {
      //#given
      const env = { daemonEndpointAvailable: true, allowDaemonSpawn: true }

      //#when
      const decision = selectCliRuntime(env)

      //#then
      expect(decision.mode).toBe("daemon")
      expect(decision.reason).toBe("daemon-endpoint")
      expect(decision.spawnDaemon).toBe(false)
    })

    test("allows a daemon spawn when no endpoint is registered and spawning is permitted", () => {
      //#given
      const env = { daemonEndpointAvailable: false, allowDaemonSpawn: true }

      //#when
      const decision = selectCliRuntime(env)

      //#then
      expect(decision.mode).toBe("daemon")
      expect(decision.reason).toBe("daemon-spawn")
      expect(decision.spawnDaemon).toBe(true)
    })
  })

  describe("in-memory fallback", () => {
    test("falls back to in-memory when no endpoint exists and spawning is disabled", () => {
      //#given
      const env = { daemonEndpointAvailable: false, allowDaemonSpawn: false }

      //#when
      const decision = selectCliRuntime(env)

      //#then
      expect(decision.mode).toBe("in-memory")
      expect(decision.reason).toBe("spawn-disabled")
      expect(decision.spawnDaemon).toBe(false)
    })

    test("falls back to in-memory when the caller explicitly prefers in-memory", () => {
      //#given
      const env = { daemonEndpointAvailable: true, allowDaemonSpawn: true, preferInMemory: true }

      //#when
      const decision = selectCliRuntime(env)

      //#then
      expect(decision.mode).toBe("in-memory")
      expect(decision.reason).toBe("prefer-in-memory")
      expect(decision.spawnDaemon).toBe(false)
    })

    test("prefers in-memory even when spawning is otherwise allowed", () => {
      //#given
      const env = { daemonEndpointAvailable: false, allowDaemonSpawn: true, preferInMemory: true }

      //#when
      const decision = selectCliRuntime(env)

      //#then
      expect(decision.mode).toBe("in-memory")
      expect(decision.reason).toBe("prefer-in-memory")
    })
  })

  describe("env-var driven defaults", () => {
    test("treats MATRIXX_CLI_DAEMON=1 as allowing a daemon spawn", () => {
      //#given
      const env = { MATRIXX_CLI_DAEMON: "1" }

      //#when
      const resolved = resolveRuntimeEnv(env)

      //#then
      expect(resolved.allowDaemonSpawn).toBe(true)
      expect(resolved.preferInMemory).toBe(false)
    })

    test("treats MATRIXX_CLI_DAEMON=0 as forbidding a daemon spawn", () => {
      //#given
      const env = { MATRIXX_CLI_DAEMON: "0" }

      //#when
      const resolved = resolveRuntimeEnv(env)

      //#then
      expect(resolved.allowDaemonSpawn).toBe(false)
    })

    test("treats an absent MATRIXX_CLI_DAEMON as forbidding a daemon spawn", () => {
      //#given
      const env = {}

      //#when
      const resolved = resolveRuntimeEnv(env)

      //#then
      expect(resolved.allowDaemonSpawn).toBe(false)
      expect(resolved.preferInMemory).toBe(false)
    })
  })
})
