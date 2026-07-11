import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import { createKeymakerAgent } from "../../../src/agents/keymaker"
import { createMorpheusAgent } from "../../../src/agents/morpheus"
import { createLibrarianAgent } from "../../../src/agents/operator"

import { createEnvContextInjectorHook } from "../../../src/hooks/env-context-injector/index"

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

//#region P2: Prefix-Cache Stability

describe("P2: prefix-cache stability — byte-identical system prompt", () => {
  afterEach(() => {
    setSystemTime()
  })

  it("Morpheus agent prompt is byte-identical across constructions with different timestamps", () => {
    //#given
    setSystemTime(new Date("2025-01-01T00:00:00Z"))

    //#when — construct first agent config
    const agent1 = createMorpheusAgent("claude-opus-4-6")

    // Advance time by over a year
    setSystemTime(new Date("2026-06-15T12:30:00Z"))

    // Construct second agent config
    const agent2 = createMorpheusAgent("claude-opus-4-6")

    //#then
    expect(agent1.prompt).toBe(agent2.prompt)
  })

  it("Keymaker agent prompt is byte-identical across constructions with different timestamps", () => {
    //#given
    setSystemTime(new Date("2025-03-01T08:00:00Z"))

    //#when
    const agent1 = createKeymakerAgent("gpt-5.3-codex")
    setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const agent2 = createKeymakerAgent("gpt-5.3-codex")

    //#then
    expect(agent1.prompt).toBe(agent2.prompt)
  })
})

describe("P2: prefix-cache stability — env context placement", () => {
  afterEach(() => {
    setSystemTime()
  })

  it("env block in user message differs between calls while system prompt is identical", async () => {
    //#given
    setSystemTime(new Date("2025-01-01T12:00:00Z"))
    const agent = createMorpheusAgent("claude-opus-4-6")
    const hook = createEnvContextInjectorHook()
    const transform = hook["experimental.chat.messages.transform"]!

    //#when — first turn
    const turn1: TestOutput = {
      messages: [
        { info: { role: "system", id: "sys_1", sessionID: "ses_p2" }, parts: [{ type: "text", text: agent.prompt, id: "p_sys1", messageID: "sys_1", sessionID: "ses_p2" }] },
        { info: { role: "user", id: "msg_1", sessionID: "ses_p2" }, parts: [{ type: "text", text: "Hello", id: "p_msg1", messageID: "msg_1", sessionID: "ses_p2" }] },
      ],
    }
    await transform({}, turn1)

    // Advance time
    setSystemTime(new Date("2025-06-15T14:30:00Z"))

    // Second turn — same agent prompt
    const turn2: TestOutput = {
      messages: [
        { info: { role: "system", id: "sys_2", sessionID: "ses_p2" }, parts: [{ type: "text", text: agent.prompt, id: "p_sys2", messageID: "sys_2", sessionID: "ses_p2" }] },
        { info: { role: "user", id: "msg_2", sessionID: "ses_p2" }, parts: [{ type: "text", text: "Do something", id: "p_msg2", messageID: "msg_2", sessionID: "ses_p2" }] },
      ],
    }
    await transform({}, turn2)

    //#then
    // System prompt is byte-identical across turns
    const sysText1 = turn1.messages[0].parts[0].text
    const sysText2 = turn2.messages[0].parts[0].text
    expect(sysText1).toBe(sysText2)

    // Both user messages have env context
    const userText1 = turn1.messages[1].parts[0].text
    const userText2 = turn2.messages[1].parts[0].text
    expect(userText1).toContain("<matrixx-env>")
    expect(userText2).toContain("<matrixx-env>")

    // User messages differ (different time)
    expect(userText1).not.toBe(userText2)
    expect(userText2).toContain("2025")
  })
})

describe("P2: prefix-cache stability — affected agents are clean", () => {
  const envTokens = ["Current date:", "Current time:", "Timezone:", "Locale:", "Current year:"]

  it("Morpheus agent config does not contain embedded env-context strings", () => {
    //#given
    const agent = createMorpheusAgent("claude-opus-4-6")

    //#then
    for (const token of envTokens) {
      expect(agent.prompt).not.toContain(token)
    }
  })

  it("Keymaker agent config does not contain embedded env-context strings", () => {
    //#given
    const agent = createKeymakerAgent("gpt-5.3-codex")

    //#then
    for (const token of envTokens) {
      expect(agent.prompt).not.toContain(token)
    }
  })

  it("Operator (Librarian) agent config does not contain embedded env-context strings", () => {
    //#given
    const agent = createLibrarianAgent("claude-haiku-4-5")

    //#then
    for (const token of envTokens) {
      expect(agent.prompt).not.toContain(token)
    }
  })
})

describe("P2: prefix-cache stability — end-to-end 2-turn simulation", () => {
  afterEach(() => {
    setSystemTime()
  })

  it("simulates 2 turns: system prompt byte-identical, user msg env context updated", async () => {
    //#given — Turn 1
    setSystemTime(new Date("2025-01-01T00:00:00Z"))
    const agentA = createMorpheusAgent("claude-opus-4-6")
    const agentB = createMorpheusAgent("claude-opus-4-6")

    const hook = createEnvContextInjectorHook()
    const transform = hook["experimental.chat.messages.transform"]!

    const turn1Output: TestOutput = {
      messages: [
        { info: { role: "system", id: "sys_1", sessionID: "ses_e2e" }, parts: [{ type: "text", text: agentA.prompt, id: "p_sys1", messageID: "sys_1", sessionID: "ses_e2e" }] },
        { info: { role: "user", id: "msg_1", sessionID: "ses_e2e" }, parts: [{ type: "text", text: "Build a login page", id: "p_msg1", messageID: "msg_1", sessionID: "ses_e2e" }] },
      ],
    }
    await transform({}, turn1Output)

    //#when — Turn 2 with different time
    setSystemTime(new Date("2025-06-15T14:30:00Z"))
    const turn2Output: TestOutput = {
      messages: [
        { info: { role: "system", id: "sys_2", sessionID: "ses_e2e" }, parts: [{ type: "text", text: agentB.prompt, id: "p_sys2", messageID: "sys_2", sessionID: "ses_e2e" }] },
        { info: { role: "user", id: "msg_2", sessionID: "ses_e2e" }, parts: [{ type: "text", text: "Add validation", id: "p_msg2", messageID: "msg_2", sessionID: "ses_e2e" }] },
      ],
    }
    await transform({}, turn2Output)

    //#then
    // The KEY claim: system prompt is byte-identical across turns
    expect(agentA.prompt).toBe(agentB.prompt)

    // User messages have env context
    const userText1 = turn1Output.messages[1].parts[0].text
    const userText2 = turn2Output.messages[1].parts[0].text
    expect(userText1).toContain("<matrixx-env>")
    expect(userText2).toContain("<matrixx-env>")

    // User msg 1 (Jan) is different from user msg 2 (Jun)
    expect(userText1).not.toBe(userText2)
    expect(userText1).toContain("Jan")
    expect(userText2).toContain("Jun")
  })
})

//#endregion
