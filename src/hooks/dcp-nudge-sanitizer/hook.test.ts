/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk"

import type { PluginContext } from "../../plugin/types"
import { createDcpNudgeSanitizerHook } from "./hook"

type MessageWithParts = { info: Message; parts: Part[] }

function makeMessage(role: "user" | "assistant", id: string): MessageWithParts {
  return {
    info: { id, sessionID: "ses_sanitize", role, time: { created: 0 } } as Message,
    parts: [],
  }
}

function textPart(text: string): Part {
  return { type: "text", text } as unknown as Part
}

function getText(part: Part): string {
  return (part as { text?: string }).text ?? ""
}

function countNudges(parts: Part[]): number {
  return parts.filter((part) => getText(part).includes("<instruction name=iteration_nudge>")).length
}

const NUDGE = "<instruction name=iteration_nudge>use the compress tool on it now</instruction>"

async function runSanitizer(messages: MessageWithParts[]): Promise<MessageWithParts[]> {
  const hook = createDcpNudgeSanitizerHook({} as PluginContext)
  await hook["experimental.chat.messages.transform"]?.({} as Record<string, never>, { messages })
  return messages
}

describe("createDcpNudgeSanitizerHook — dedupe and cap sticky nudges", () => {
  test("keeps at most one nudge part per message", async () => {
    //#given
    const message = makeMessage("assistant", "msg_1")
    message.parts = [
      textPart("real assistant answer"),
      textPart(NUDGE),
      textPart(NUDGE),
      textPart(NUDGE),
    ]

    //#when
    await runSanitizer([message])

    //#then
    expect(countNudges(message.parts)).toBe(1)
    expect(getText(message.parts[0])).toBe("real assistant answer")
    expect(message.parts.length).toBe(2)
  })

  test("caps nudges globally across the transcript", async () => {
    //#given
    const first = makeMessage("assistant", "msg_1")
    first.parts = [textPart(NUDGE)]
    const second = makeMessage("assistant", "msg_2")
    second.parts = [textPart(NUDGE), textPart("tail")]

    //#when
    await runSanitizer([first, second])

    //#then
    expect(countNudges(first.parts)).toBe(1)
    expect(countNudges(second.parts)).toBe(0)
    expect(second.parts.length).toBe(1)
  })

  test("leaves messages without nudges untouched", async () => {
    //#given
    const message = makeMessage("user", "msg_1")
    message.parts = [textPart("hello"), textPart("world")]

    //#when
    await runSanitizer([message])

    //#then
    expect(message.parts.length).toBe(2)
    expect(getText(message.parts[0])).toBe("hello")
    expect(getText(message.parts[1])).toBe("world")
  })

  test("recognizes compressed-block markers and trims the kept part", async () => {
    //#given
    const message = makeMessage("assistant", "msg_1")
    message.parts = [
      textPart("  Compressed block context: prior summary (b2)  "),
      textPart("Compressed block context: duplicate (b3)"),
    ]

    //#when
    await runSanitizer([message])

    //#then
    expect(message.parts.length).toBe(1)
    expect(getText(message.parts[0])).toBe("Compressed block context: prior summary (b2)")
  })

  test("does not delete non-text parts", async () => {
    //#given
    const message = makeMessage("assistant", "msg_1")
    message.parts = [
      { type: "tool_use", id: "call_1" } as unknown as Part,
      textPart(NUDGE),
      textPart(NUDGE),
    ]

    //#when
    await runSanitizer([message])

    //#then
    expect(message.parts.length).toBe(2)
    expect((message.parts[0] as { type: string }).type).toBe("tool_use")
    expect(countNudges(message.parts)).toBe(1)
  })
})
