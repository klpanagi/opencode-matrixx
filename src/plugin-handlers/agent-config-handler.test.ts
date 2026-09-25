import { describe, expect, test } from "bun:test"
import { getModelDirectives } from "../agents/model-directives"
import { injectContextDiscipline } from "./agent-config-handler"

const DEEPSEEK = "deepseek/deepseek-v4.1-flash"
const ANTHROPIC = "anthropic/claude-sonnet-4"
const MARKER = getModelDirectives(DEEPSEEK).antiEcho!

describe("injectContextDiscipline model directives", () => {
  test("injects the directive when the agent model is deepseek", () => {
    //#given
    const agents: Record<string, Record<string, unknown>> = {
      oracle: { model: DEEPSEEK, prompt: "base prompt" },
    }

    //#when
    injectContextDiscipline(["ctx_search"], agents)

    //#then
    expect(agents.oracle.prompt as string).toContain(MARKER)
  })

  test("omits the directive when the agent model is anthropic", () => {
    //#given
    const agents: Record<string, Record<string, unknown>> = {
      oracle: { model: ANTHROPIC, prompt: "base prompt" },
    }

    //#when
    injectContextDiscipline(["ctx_search"], agents)

    //#then
    expect(agents.oracle.prompt as string).not.toContain(MARKER)
  })
})
