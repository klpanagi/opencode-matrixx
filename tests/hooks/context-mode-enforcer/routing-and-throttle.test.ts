/// <reference types="bun-types" />

import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import type { MatrixxConfig } from "../../../src/config"
import {
  BASH_ROUTED_MESSAGE,
  WARN_MESSAGE_READ,
  WEBFETCH_BLOCK_MESSAGE,
} from "../../../src/hooks/context-mode-enforcer/constants"
import { _resetGuidanceThrottleForTesting } from "../../../src/hooks/context-mode-enforcer/guidance-throttle"
import { createContextModeEnforcerHook } from "../../../src/hooks/context-mode-enforcer/hook"
import { _resetContextModeEnforcementForTesting, _setDisciplinePathForTesting } from "../../../src/shared/context-mode-enforcement"

const WORKING_SUBSTITUTE = "/nonexistent-fake/AGENTS.md"

/** Bash hard-throws only when `bash` is itself gated. */
const BASH_GATED = ["bash", "grep", "glob"]

function makeConfig(contextMode: unknown): MatrixxConfig {
  return { context_mode: contextMode } as unknown as MatrixxConfig
}

function clearMarkers(sessionID: string): void {
  rmSync(resolve(tmpdir(), `matrixx-ctx-guidance-s-${sessionID}`), { recursive: true, force: true })
}

let seq = 0

/** Each run gets a fresh session id so the once-per-session throttle is observable. */
function runHook(contextMode: unknown, tool: string, args: Record<string, unknown> = {}) {
  const sessionID = `ses_route_${++seq}`
  clearMarkers(sessionID)
  const hook = createContextModeEnforcerHook(makeConfig(contextMode))
  const output: { args: Record<string, unknown>; message?: string } = { args }
  const promise = hook["tool.execute.before"]({ tool, sessionID } as never, output as never)
  return { promise, output, sessionID }
}

function runHookInSession(contextMode: unknown, tool: string, sessionID: string, args: Record<string, unknown> = {}) {
  const hook = createContextModeEnforcerHook(makeConfig(contextMode))
  const output: { args: Record<string, unknown>; message?: string } = { args }
  const promise = hook["tool.execute.before"]({ tool, sessionID } as never, output as never)
  return { promise, output }
}

afterEach(() => {
  _resetGuidanceThrottleForTesting()
  _resetContextModeEnforcementForTesting()
})

describe("context-mode-enforcer routing + throttle", () => {
  describe("webfetch", () => {
    test("default config sets a throttled message", async () => {
      //#given: stock config (enforce defaults to false, webfetch is in blocked_tools)
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({}, "webfetch", { url: "https://example.com" })

      //#when: webfetch runs
      await promise

      //#then: advisory, never a throw
      expect(output.message).toBe(WEBFETCH_BLOCK_MESSAGE)
    })

    test("advisory fires at most once per session", async () => {
      //#given: two webfetch calls in one session
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const sessionID = `ses_route_once_${++seq}`
      clearMarkers(sessionID)
      const first = runHookInSession({}, "webfetch", sessionID, { url: "https://a.example" })
      await first.promise

      //#when: the second call happens
      const second = runHookInSession({}, "webfetch", sessionID, { url: "https://b.example" })
      await second.promise

      //#then: only the first is annotated
      expect(first.output.message).toBe(WEBFETCH_BLOCK_MESSAGE)
      expect(second.output.message).toBeUndefined()
    })

    test("throws only when enforce AND a working substitute exists", async () => {
      //#given: enforce on, substitute present
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise } = runHook({ enforce: true }, "webfetch", { url: "https://example.com" })

      //#when: webfetch runs
      //#then: blocked with the fetch-and-index message
      await expect(promise).rejects.toThrow("ctx_fetch_and_index")
    })

    test("warns instead of throwing when no substitute is installed", async () => {
      //#given: enforce on, no indexed discipline
      _setDisciplinePathForTesting(null)
      const { promise, output } = runHook({ enforce: true }, "webfetch", { url: "https://example.com" })

      //#when: webfetch runs
      await promise

      //#then: soft advisory so the agent is never stranded
      expect(output.message).toBe(WEBFETCH_BLOCK_MESSAGE)
    })

    test("untouched when webfetch is not in blocked_tools", async () => {
      //#given: user opts webfetch back in
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: ["grep", "glob"] }, "webfetch", {
        url: "https://example.com",
      })

      //#when: webfetch runs
      await promise

      //#then: no interception
      expect(output.message).toBeUndefined()
    })
  })

  describe("bash routing", () => {
    test("curl under enforce is routed to the sandbox", async () => {
      //#given: enforce on
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "curl https://example.com" })

      //#when: the fetch-shaped command runs
      //#then: routed with the ctx_batch_execute/ctx_execute message
      await expect(promise).rejects.toThrow(BASH_ROUTED_MESSAGE)
    })

    test("inline http url in a command under enforce is routed", async () => {
      //#given: enforce on
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "node fetch.js https://example.com/data.json" })

      //#when: the command runs
      //#then: routed
      await expect(promise).rejects.toThrow("ctx_batch_execute")
    })

    test("build-tool commands are advisory, never a hard throw", async () => {
      //#given: enforce on, a dev-loop build command
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "bun run build" })

      //#when: the command runs
      await promise

      //#then: warned through the throttle, execution never blocked
      expect(output.message).toBe(BASH_ROUTED_MESSAGE)
    })

    test("fetch-shaped build command still throws (fetch wins over the build carve-out)", async () => {
      //#given: enforce on, a build tool that also fetches over http
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "pip install https://example.com/pkg.tar.gz" })

      //#when: the command runs
      //#then: routed
      await expect(promise).rejects.toThrow(BASH_ROUTED_MESSAGE)
    })

    test("fetch-shaped command is advisory when bash is not gated", async () => {
      //#given: enforce on, bash not in blocked_tools
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: ["grep", "glob"] }, "bash", {
        command: "curl https://example.com",
      })

      //#when: the command runs
      await promise

      //#then: warns, never throws
      expect(output.message).toBe(BASH_ROUTED_MESSAGE)
    })

    test("git status is untouched", async () => {
      //#given: enforce on
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "git status" })

      //#when: the command runs
      await promise

      //#then: observe-grade shell stays correct
      expect(output.message).toBeUndefined()
    })

    test("pwd and whoami are untouched", async () => {
      //#given: enforce on
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: BASH_GATED }, "bash", { command: "pwd && whoami" })

      //#when: the command runs
      await promise

      //#then: no advisory
      expect(output.message).toBeUndefined()
    })

    test("routed advisory fires at most once per session", async () => {
      //#given: two fetch-shaped commands in one session
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const sessionID = `ses_route_bash_${++seq}`
      clearMarkers(sessionID)
      const first = runHookInSession({ enforce: false }, "bash", sessionID, { command: "curl https://a.example" })
      await first.promise
      const second = runHookInSession({ enforce: false }, "bash", sessionID, { command: "wget https://b.example" })
      await second.promise

      //#then: only the first is annotated
      expect(first.output.message).toBe(BASH_ROUTED_MESSAGE)
      expect(second.output.message).toBeUndefined()
    })
  })

  describe("read stays warn-only", () => {
    test("never throws even when read is gated and enforce is on", async () => {
      //#given: read explicitly blocked, enforce on, substitute present
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const { promise, output } = runHook({ enforce: true, blocked_tools: ["read", "grep", "glob"] }, "read", {
        filePath: "/tmp/x.ts",
      })

      //#when: read runs
      await promise

      //#then: advisory only — Edit needs the exact bytes
      expect(output.message).toBe(WARN_MESSAGE_READ)
    })

    test("advisory fires at most once per session", async () => {
      //#given: two reads in one session
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const sessionID = `ses_route_read_${++seq}`
      clearMarkers(sessionID)
      const first = runHookInSession({ enforce: true, blocked_tools: ["read"] }, "read", sessionID, {
        filePath: "/tmp/a.ts",
      })
      await first.promise
      const second = runHookInSession({ enforce: true, blocked_tools: ["read"] }, "read", sessionID, {
        filePath: "/tmp/b.ts",
      })
      await second.promise

      //#then: only the first is annotated
      expect(first.output.message).toBe(WARN_MESSAGE_READ)
      expect(second.output.message).toBeUndefined()
    })
  })

  describe("grep/glob advisory", () => {
    test("default config annotates the first call only", async () => {
      //#given: stock config
      _setDisciplinePathForTesting(WORKING_SUBSTITUTE)
      const sessionID = `ses_route_grep_${++seq}`
      clearMarkers(sessionID)
      const first = runHookInSession({}, "grep", sessionID, { pattern: "foo" })
      await first.promise
      const second = runHookInSession({}, "grep", sessionID, { pattern: "bar" })
      await second.promise

      //#then: throttled
      expect(first.output.message).toBeDefined()
      expect(second.output.message).toBeUndefined()
    })
  })
})
