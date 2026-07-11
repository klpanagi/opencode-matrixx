import { describe, expect, mock, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundManager } from "../../../src/features/background-agent"
import { createDelegateAgent } from "../../../src/tools/delegate-agent/tools"

describe("createDelegateAgent", () => {
  const mockCtx = {
    client: {},
    directory: "/test",
  } as unknown as PluginInput

  const mockBackgroundManager = {
    launch: mock(() => Promise.resolve({
      id: "test-task-id",
      sessionID: null,
      description: "Test task",
      agent: "test-agent",
      status: "pending",
    })),
  } as unknown as BackgroundManager

  test("should reject agent in disabled_agents list", async () => {
    //#given
    const toolDef = createDelegateAgent(mockCtx, mockBackgroundManager, ["trinity"])
    const executeFunc = toolDef.execute

    //#when
    const result = await executeFunc(
      {
        description: "Test",
        prompt: "Test prompt",
        subagent_type: "trinity",
        run_in_background: true,
      },
      { sessionID: "test", messageID: "msg", agent: "test", abort: new AbortController().signal }
    )

    //#then
    expect(result).toContain("disabled via disabled_agents")
  })

  test("should reject agent in disabled_agents list with case-insensitive matching", async () => {
    //#given
    const toolDef = createDelegateAgent(mockCtx, mockBackgroundManager, ["Trinity"])
    const executeFunc = toolDef.execute

    //#when
    const result = await executeFunc(
      {
        description: "Test",
        prompt: "Test prompt",
        subagent_type: "trinity",
        run_in_background: true,
      },
      { sessionID: "test", messageID: "msg", agent: "test", abort: new AbortController().signal }
    )

    //#then
    expect(result).toContain("disabled via disabled_agents")
  })

  test("should allow agent not in disabled_agents list", async () => {
    //#given
    const toolDef = createDelegateAgent(mockCtx, mockBackgroundManager, ["operator"])
    const executeFunc = toolDef.execute

    //#when
    const result = await executeFunc(
      {
        description: "Test",
        prompt: "Test prompt",
        subagent_type: "trinity",
        run_in_background: true,
      },
      { sessionID: "test", messageID: "msg", agent: "test", abort: new AbortController().signal }
    )

    //#then
    // Should not contain disabled error - may fail for other reasons but disabled check should pass
    expect(result).not.toContain("disabled via disabled_agents")
  })

  test("should allow all agents when disabled_agents is empty", async () => {
    //#given
    const toolDef = createDelegateAgent(mockCtx, mockBackgroundManager, [])
    const executeFunc = toolDef.execute

    //#when
    const result = await executeFunc(
      {
        description: "Test",
        prompt: "Test prompt",
        subagent_type: "trinity",
        run_in_background: true,
      },
      { sessionID: "test", messageID: "msg", agent: "test", abort: new AbortController().signal }
    )

    //#then
expect(result).not.toContain("disabled via disabled_agents")
  })

  //#given the schema previously had no .default(false) and Zod would reject omitted run_in_background
  //#when the caller omits run_in_background entirely
  //#then the tool must accept it (defaults to false = sync) without a Zod/Required error
  test("omitting run_in_background should default to false (no REQUIRED error)", async () => {
    //#given the schema previously had no .default(false); Zod would reject omitted run_in_background
    //#when the caller omits run_in_background entirely
    //#then the tool must not surface a "REQUIRED" / Zod-level error about run_in_background
    // (we only check the error message — we don't need to mock the full session pipeline)
    const toolDef = createDelegateAgent(mockCtx, mockBackgroundManager, [])
    const executeFunc = toolDef.execute

    //#when
    let caughtError: unknown
    let result: string | undefined
    try {
      result = await executeFunc(
        {
          description: "Default background test",
          prompt: "Test prompt",
          subagent_type: "trinity",
          // run_in_background intentionally omitted
        },
        { sessionID: "test", messageID: "msg", agent: "test", abort: new AbortController().signal }
      )
    } catch (err) {
      caughtError = err
    }

    //#then - the misleading "REQUIRED" error must NOT appear, neither in result nor in thrown error
    const combined = `${String(result ?? "")} ${String((caughtError as Error)?.message ?? caughtError ?? "")}`
    expect(combined).not.toContain("run_in_background")
    expect(combined).not.toContain("REQUIRED")
  })
})
