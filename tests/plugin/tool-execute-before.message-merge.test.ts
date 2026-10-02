import { describe, expect, test } from "bun:test"
import { createToolExecuteBeforeHandler } from "../../src/plugin/tool-execute-before"

const ENFORCER_MESSAGE = "[context-mode-enforcer] use ctx_execute instead"
const GUARD_MESSAGE = "[bash-file-read-guard] use the read tool"

describe("output.message merge across waves", () => {
  test("Wave-2 enforcer message survives Wave-3 bashFileReadGuard overwrite", async () => {
    //#given
    const hooks = {
      contextModeEnforcer: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = ENFORCER_MESSAGE
        },
      },
      bashFileReadGuard: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = GUARD_MESSAGE
        },
      },
    }
    const ctx = { client: {} } as never
    const handler = createToolExecuteBeforeHandler({ ctx, hooks: hooks as never })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output: { args: Record<string, unknown>; message?: string } = { args: { command: "cat foo.ts" } }

    //#when
    await handler(input, output)

    //#then
    expect(output.message).toBe(`${ENFORCER_MESSAGE}\n\n${GUARD_MESSAGE}`)
  })

  test("merge is idempotent when the prefix is already present", async () => {
    //#given
    const hooks = {
      contextModeEnforcer: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = ENFORCER_MESSAGE
        },
      },
      bashFileReadGuard: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = GUARD_MESSAGE
        },
      },
    }
    const ctx = { client: {} } as never
    const handler = createToolExecuteBeforeHandler({ ctx, hooks: hooks as never })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output: { args: Record<string, unknown>; message?: string } = { args: { command: "cat foo.ts" } }

    //#when
    await handler(input, output)
    await handler(input, output)

    //#then
    expect(output.message).toBe(`${ENFORCER_MESSAGE}\n\n${GUARD_MESSAGE}`)
  })

  test("does not re-append a prefix already present in the wave-3 message", async () => {
    //#given
    const hooks = {
      contextModeEnforcer: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = ENFORCER_MESSAGE
        },
      },
      bashFileReadGuard: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = `${ENFORCER_MESSAGE}\n\n${GUARD_MESSAGE}`
        },
      },
    }
    const ctx = { client: {} } as never
    const handler = createToolExecuteBeforeHandler({ ctx, hooks: hooks as never })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output: { args: Record<string, unknown>; message?: string } = { args: { command: "cat foo.ts" } }

    //#when
    await handler(input, output)

    //#then
    expect(output.message).toBe(`${ENFORCER_MESSAGE}\n\n${GUARD_MESSAGE}`)
  })

  test("guard message alone is preserved when there is no preexisting message", async () => {
    //#given
    const hooks = {
      bashFileReadGuard: {
        "tool.execute.before": async (_input: unknown, output: { message?: string }) => {
          output.message = GUARD_MESSAGE
        },
      },
    }
    const ctx = { client: {} } as never
    const handler = createToolExecuteBeforeHandler({ ctx, hooks: hooks as never })
    const input = { tool: "bash", sessionID: "ses_test", callID: "call_1" }
    const output: { args: Record<string, unknown>; message?: string } = { args: { command: "cat foo.ts" } }

    //#when
    await handler(input, output)

    //#then
    expect(output.message).toBe(GUARD_MESSAGE)
  })
})