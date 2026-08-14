import { afterAll, afterEach, describe, expect, it, mock } from "bun:test"
import { _resetMcpStartupFailuresForTesting } from "../../../src/mcp/mcp-startup-state"

const mockShowToast = mock(async () => {})

const realLoggerModule = require("../../../src/shared/logger")

mock.module("../../../src/shared/logger", () => ({
  log: () => {},
}))

const { createMcpStartupNotificationHook } = await import("../../../src/hooks/mcp-startup-notification")

afterAll(() => {
  mock.module("../../../src/shared/logger", () => realLoggerModule)
  mock.restore()
})

afterEach(() => {
  _resetMcpStartupFailuresForTesting()
  mockShowToast.mockClear()
})

function makeCtx(): { client: { tui: { showToast: typeof mockShowToast } } } {
  return {
    client: {
      tui: {
        showToast: mockShowToast,
      },
    },
  }
}

describe("createMcpStartupNotificationHook", () => {
  it("shows one warning toast when MCP startup failures exist", async () => {
    //#given - failures recorded during config load
    const { setMcpStartupFailures } = await import("../../../src/mcp/mcp-startup-state")
    setMcpStartupFailures([
      { name: "websearch", error: "TAVILY_API_KEY missing" },
      { name: "document_reader", error: "uvx not found" },
    ])

    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when - session.created event arrives
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: undefined } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then - exactly one toast, warning variant, lists failed MCPs
    expect(mockShowToast).toHaveBeenCalledTimes(1)
    const firstCall = mockShowToast.mock.calls[0]?.[0] as { body?: { title?: string; message?: string; variant?: string } }
    expect(firstCall.body?.variant).toBe("warning")
    expect(firstCall.body?.title).toContain("2 MCP")
    expect(firstCall.body?.message).toContain("websearch")
    expect(firstCall.body?.message).toContain("document_reader")
  })

  it("shows no toast when there are no failures", async () => {
    //#given - no failures
    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: undefined } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it("skips subagent sessions (parentID present)", async () => {
    //#given
    const { setMcpStartupFailures } = await import("../../../src/mcp/mcp-startup-state")
    setMcpStartupFailures([{ name: "websearch", error: "TAVILY_API_KEY missing" }])

    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when - subagent session.created (parentID set)
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: "parent-session-id" } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it("ignores non-session.created events", async () => {
    //#given
    const { setMcpStartupFailures } = await import("../../../src/mcp/mcp-startup-state")
    setMcpStartupFailures([{ name: "websearch", error: "TAVILY_API_KEY missing" }])

    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when - unrelated event
    hook.event({ event: { type: "message.updated", properties: {} } })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it("shows toast only once per process even with multiple session.created events", async () => {
    //#given
    const { setMcpStartupFailures } = await import("../../../src/mcp/mcp-startup-state")
    setMcpStartupFailures([{ name: "document_reader", error: "uvx not found" }])

    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when - two session.created events
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: undefined } },
      },
    })
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: undefined } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then
    expect(mockShowToast).toHaveBeenCalledTimes(1)
  })

  it("shows no toast in CLI run mode", async () => {
    //#given
    process.env.OPENCODE_CLI_RUN_MODE = "true"
    const { setMcpStartupFailures } = await import("../../../src/mcp/mcp-startup-state")
    setMcpStartupFailures([{ name: "document_reader", error: "uvx not found" }])

    const hook = createMcpStartupNotificationHook(makeCtx() as never)

    //#when
    hook.event({
      event: {
        type: "session.created",
        properties: { info: { parentID: undefined } },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 25))

    //#then
    expect(mockShowToast).not.toHaveBeenCalled()
    delete process.env.OPENCODE_CLI_RUN_MODE
  })
})
