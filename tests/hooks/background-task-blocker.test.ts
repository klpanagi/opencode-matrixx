import { describe, expect, it } from "bun:test"
import { createBackgroundTaskBlockerHook } from "../../src/hooks/background-task-blocker/hook"

describe("createBackgroundTaskBlockerHook", () => {
  const createInput = (tool: string) => ({
    tool,
    sessionID: "test-session",
    callID: "test-call-id",
  })

  const dummyOutput = { args: {}, message: "test" }

  describe("tool.execute.before", () => {
    describe("#given background_task tool", () => {
      it("#then should throw with message containing 'background_task is disabled' and 'task'", async () => {
        const hook = createBackgroundTaskBlockerHook()
        const input = createInput("background_task")

        await expect(
          hook["tool.execute.before"](input, dummyOutput),
        ).rejects.toThrow(/background_task.*disabled.*task/i)
      })
    })

    describe("#given background_output tool", () => {
      it("#then should not throw", async () => {
        const hook = createBackgroundTaskBlockerHook()
        const input = createInput("background_output")

        await expect(
          hook["tool.execute.before"](input, dummyOutput),
        ).resolves.toBeUndefined()
      })
    })

    describe("#given background_cancel tool", () => {
      it("#then should not throw", async () => {
        const hook = createBackgroundTaskBlockerHook()
        const input = createInput("background_cancel")

        await expect(
          hook["tool.execute.before"](input, dummyOutput),
        ).resolves.toBeUndefined()
      })
    })

    describe("#given bash tool", () => {
      it("#then should not throw", async () => {
        const hook = createBackgroundTaskBlockerHook()
        const input = createInput("bash")

        await expect(
          hook["tool.execute.before"](input, dummyOutput),
        ).resolves.toBeUndefined()
      })
    })
  })
})
