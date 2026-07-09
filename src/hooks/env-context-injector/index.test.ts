import { describe, expect, it } from "bun:test"

import { createEnvContextInjectorHook } from "./index"

type TestPart = {
  type: "text"
  text: string
  id: string
  messageID: string
  sessionID: string
}
type TestMessage = { info: { role: string; id: string; sessionID: string }; parts: TestPart[] }
type TestOutput = { messages: TestMessage[] }

function createMessage(role: string, text: string, id = "msg_1"): TestMessage {
  return {
    info: { role, id, sessionID: "ses_test" },
    parts: [
      {
        type: "text",
        text,
        id: `part_${id}`,
        messageID: id,
        sessionID: "ses_test",
      },
    ],
  }
}

function getTransform(): (input: Record<string, never>, output: TestOutput) => Promise<void> {
  const hook = createEnvContextInjectorHook()
  const transform = hook["experimental.chat.messages.transform"]
  if (!transform) {
    throw new Error("experimental.chat.messages.transform not defined on hook")
  }
  return transform
}

describe("createEnvContextInjectorHook", () => {
  it("appends env block to last user message text part", async () => {
    //#given
    const transform = getTransform()
    const output: TestOutput = {
      messages: [
        createMessage("system", "System prompt."),
        createMessage("user", "First message"),
        createMessage("assistant", "Response."),
        createMessage("user", "Do something"),
      ],
    }

    //#when
    await transform({}, output)

    //#then
    const lastUserMsg = output.messages[3]
    const textPart = lastUserMsg.parts[0]
    expect(textPart.text).toContain("Do something")
    expect(textPart.text).toContain("<matrixx-env>")
  })

  it("handles empty messages gracefully", async () => {
    //#given
    const transform = getTransform()
    const output: TestOutput = { messages: [] }

    //#when
    await transform({}, output)

    //#then
    expect(output.messages).toHaveLength(0)
  })

  it("handles no user messages gracefully", async () => {
    //#given
    const transform = getTransform()
    const output: TestOutput = {
      messages: [
        createMessage("system", "System prompt."),
        createMessage("assistant", "How can I help?"),
      ],
    }

    //#when
    await transform({}, output)

    //#then
    expect(output.messages[0].parts[0].text).not.toContain("<matrixx-env>")
    expect(output.messages[1].parts[0].text).not.toContain("<matrixx-env>")
  })

  it("does not modify system, assistant, or tool messages", async () => {
    //#given
    const transform = getTransform()
    const output: TestOutput = {
      messages: [
        createMessage("system", "System prompt."),
        createMessage("assistant", "Hello"),
        createMessage("user", "My query"),
        createMessage("tool", "Result data"),
      ],
    }

    //#when
    await transform({}, output)

    //#then - only the user message (index 2) should contain env context
    expect(output.messages[0].parts[0].text).not.toContain("<matrixx-env>")
    expect(output.messages[1].parts[0].text).not.toContain("<matrixx-env>")
    expect(output.messages[3].parts[0].text).not.toContain("<matrixx-env>")
    expect(output.messages[2].parts[0].text).toContain("<matrixx-env>")
  })

  it("each call generates fresh env context (not cached across calls)", async () => {
    //#given
    const transform = getTransform()

    //#when
    const output1: TestOutput = { messages: [createMessage("user", "First")] }
    const output2: TestOutput = { messages: [createMessage("user", "Second")] }
    await transform({}, output1)
    await transform({}, output2)

    //#then
    expect(output1.messages[0].parts[0].text).toContain("<matrixx-env>")
    expect(output2.messages[0].parts[0].text).toContain("<matrixx-env>")
  })
})
