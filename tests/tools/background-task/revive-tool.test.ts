/// <reference types="bun-types" />

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import type { BackgroundManager } from "../../../src/features/background-agent"
import { createBackgroundRevive } from "../../../src/tools/background-task/create-background-revive"

const testContext = {
  sessionID: "parent-session",
  messageID: "parent-message",
  agent: "morpheus",
  abort: new AbortController().signal,
}

function extractMetadata(output: string): Record<string, unknown> {
  const match = output.match(/<task_metadata>([\s\S]*?)<\/task_metadata>/)
  if (!match) throw new Error(`no <task_metadata> block found in output: ${output}`)
  return JSON.parse(match[1]) as Record<string, unknown>
}

function fakeManager(overrides: Partial<Record<"revive" | "listRevivable", unknown>>): BackgroundManager {
  return {
    revive: async () => {
      throw new Error("revive() should not have been called")
    },
    listRevivable: () => [],
    ...overrides,
  } as unknown as BackgroundManager
}

describe("createBackgroundRevive", () => {
  describe("discovery mode", () => {
    test("bare call with no revivable tasks returns a clear, non-throwing message", async () => {
      //#given a manager that reports no revivable tasks
      const tool = createBackgroundRevive(fakeManager({}), process.cwd())

      //#when a bare call is made
      const result = await tool.execute({}, testContext)

      //#then the user gets an explanation, not an error
      expect(result).toContain("No revivable background tasks")
    })

    test("list mode surfaces every revivable task", async () => {
      //#given two revivable entries on disk
      const tool = createBackgroundRevive(
        fakeManager({
          listRevivable: () => [
            { taskId: "bg_aaa", description: "first", agent: "mouse", status: "cancelled", sessionID: "ses_aaa" },
            {
              taskId: "bg_bbb",
              description: "second",
              agent: "mouse",
              status: "stopped",
              sessionID: "ses_bbb",
              terminalReason: "no-output",
            },
          ],
        }),
        process.cwd(),
      )

      //#when list mode is requested
      const result = await tool.execute({ list: true }, testContext)

      //#then both tasks and the terminal reason are visible
      expect(result).toContain("bg_aaa")
      expect(result).toContain("bg_bbb")
      expect(result).toContain("no-output")
      expect(result).toContain("ses_aaa")
    })

    test("explicit parentSessionID is forwarded to listRevivable", async () => {
      //#given a manager that records the scoping argument
      let received: string | undefined
      const tool = createBackgroundRevive(
        fakeManager({
          listRevivable: (parentSessionID?: string) => {
            received = parentSessionID
            return []
          },
        }),
        process.cwd(),
      )

      //#when discovery is scoped explicitly
      await tool.execute({ list: true, parentSessionID: "some-other-parent" }, testContext)

      //#then the explicit value wins over the calling session
      expect(received).toBe("some-other-parent")
    })
  })

  describe("revive mode", () => {
    test("a successful revive returns the structured revived block", async () => {
      //#given a manager that revives successfully
      const tool = createBackgroundRevive(
        fakeManager({ revive: async () => ({ id: "bg_aaa", sessionID: "ses_aaa", status: "running" }) }),
        process.cwd(),
      )

      //#when a revive is requested
      const result = await tool.execute({ taskId: "bg_aaa", prompt: "please continue" }, testContext)

      //#then the outcome parses machine-readably
      expect(result).toContain("revived")
      const metadata = extractMetadata(result)
      expect(metadata.task_id).toBe("bg_aaa")
      expect(metadata.session_id).toBe("ses_aaa")
      expect(metadata.status).toBe("running")
      expect(metadata.reason).toBe("revived")
    })

    test("a missing prompt is refused without ever calling revive()", async () => {
      //#given a manager that would fail loudly if revive() were reached
      let reviveCalled = false
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            reviveCalled = true
            throw new Error("unexpected")
          },
        }),
        process.cwd(),
      )

      //#when no prompt is supplied
      const result = await tool.execute({ taskId: "bg_aaa" }, testContext)

      //#then the call is refused up-front
      expect(reviveCalled).toBe(false)
      expect(result).toContain("NOT revived")
      expect(extractMetadata(result).status).toBe("unrevived")
    })

    test("not-found with no handle on disk maps to expired", async () => {
      //#given a manager whose revive rejects as not-found, in an empty project dir
      const emptyDir = mkdtempSync(join(tmpdir(), "revive-tool-"))
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error(
              "Task not found for revive: bg_missing. It may have expired (handles are retained 30 minutes) or never existed.",
            )
          },
        }),
        emptyDir,
      )

      //#when the revive is attempted
      const result = await tool.execute({ taskId: "bg_missing", prompt: "retry" }, testContext)

      //#then it is reported as expired and the call resolves
      expect(result).toContain("expired")
      expect(extractMetadata(result).reason).toBe("expired")
    })

    test("not-found with a handle still on disk maps to unknown-task (not expired)", async () => {
      //#given a project dir that DOES contain a handle file for the id
      const projectDir = mkdtempSync(join(tmpdir(), "revive-tool-"))
      const handleDir = join(projectDir, ".matrixx", "bg-handles")
      mkdirSync(handleDir, { recursive: true })
      writeFileSync(join(handleDir, "bg_present.json"), "{}")

      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error("Task not found for revive: bg_present. It may have expired or never existed.")
          },
        }),
        projectDir,
      )

      //#when the revive is attempted
      const result = await tool.execute({ taskId: "bg_present", prompt: "retry" }, testContext)

      //#then the on-disk handle distinguishes it from an expired id
      expect(extractMetadata(result).reason).toBe("unknown-task")
    })

    test("still-active failure maps to active", async () => {
      //#given a manager that reports the task as still running
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error("Task bg_live is still active; use background_output to inspect it.")
          },
        }),
        process.cwd(),
      )

      //#when a revive is attempted
      const result = await tool.execute({ taskId: "bg_live", prompt: "x" }, testContext)

      //#then the reason is active
      expect(extractMetadata(result).reason).toBe("active")
    })

    test("uncertain failure maps to uncertain", async () => {
      //#given a manager that reports unknown liveness
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error("Task bg_uncertain has unknown liveness; re-run with force: true to acknowledge this.")
          },
        }),
        process.cwd(),
      )

      //#when a revive is attempted without force
      const result = await tool.execute({ taskId: "bg_uncertain", prompt: "x" }, testContext)

      //#then the reason is uncertain
      expect(extractMetadata(result).reason).toBe("uncertain")
    })

    test("no-session failure maps to no-session", async () => {
      //#given a manager that reports no session to revive
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error(
              "Task bg_sat has no session to revive (it never produced one, e.g. it was queue-saturated).",
            )
          },
        }),
        process.cwd(),
      )

      //#when a revive is attempted
      const result = await tool.execute({ taskId: "bg_sat", prompt: "x" }, testContext)

      //#then the reason is no-session
      expect(extractMetadata(result).reason).toBe("no-session")
    })

    test("an unrecognised failure resolves (never rejects) and maps to unknown-task", async () => {
      //#given a manager that throws something unclassifiable
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw new Error("something entirely unexpected")
          },
        }),
        process.cwd(),
      )

      //#when a revive is attempted
      const result = await tool.execute({ taskId: "bg_x", prompt: "x" }, testContext)

      //#then the tool still resolves with a structured outcome
      expect(extractMetadata(result).reason).toBe("unknown-task")
      expect(result).toContain("something entirely unexpected")
    })

    test("a non-Error rejection is handled without throwing", async () => {
      //#given a manager that rejects with a non-Error value
      const tool = createBackgroundRevive(
        fakeManager({
          revive: async () => {
            throw "plain string failure"
          },
        }),
        process.cwd(),
      )

      //#when a revive is attempted
      const result = await tool.execute({ taskId: "bg_y", prompt: "x" }, testContext)

      //#then it is still converted into an outcome
      expect(result).toContain("NOT revived")
      expect(extractMetadata(result).reason).toBe("unknown-task")
    })
  })
})
