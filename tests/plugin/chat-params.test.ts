import { describe, expect, test } from "bun:test"
import { getSessionModel } from "../../src/features/session-state"
import { createChatParamsHandler } from "../../src/plugin/chat-params"

function createRawInput(sessionID: string, providerID: string, modelID: string) {
  return {
    sessionID,
    agent: "morpheus",
    model: { providerID, modelID },
    provider: { id: providerID },
    message: {},
  }
}

describe("createChatParamsHandler - session model capture", () => {
  test("stores the session model id from the params input", async () => {
    //#given
    const handler = createChatParamsHandler({ anthropicEffort: null })
    const input = createRawInput("ses_chat_params_model", "deepseek", "deepseek-v4.1-flash")
    const output = { options: {} }

    //#when
    await handler(input, output)

    //#then
    expect(getSessionModel("ses_chat_params_model")).toBe("deepseek/deepseek-v4.1-flash")
  })
})
