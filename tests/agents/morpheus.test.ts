import { describe, expect, test } from "bun:test"
import { createKeymakerAgent } from "../../src/agents/keymaker"
import { getModelDirectives } from "../../src/agents/model-directives"
import { createMorpheusAgent } from "../../src/agents/morpheus"

const DEEPSEEK = "deepseek/deepseek-v4.1-flash"
const ANTHROPIC = "anthropic/claude-sonnet-4"
const MARKER = getModelDirectives(DEEPSEEK).antiEcho!

describe("morpheus prompt model directives", () => {
  test("includes the anti-echo directive for a deepseek-configured agent", () => {
    //#given
    const tools = ["ctx_search"]

    //#when
    const agent = createMorpheusAgent(DEEPSEEK, [], tools)

    //#then
    expect(agent.prompt as string).toContain(MARKER)
  })

  test("omits the anti-echo directive for an anthropic-configured agent", () => {
    //#given
    const tools = ["ctx_search"]

    //#when
    const agent = createMorpheusAgent(ANTHROPIC, [], tools)

    //#then
    expect(agent.prompt as string).not.toContain(MARKER)
  })
})

describe("keymaker prompt model directives", () => {
  test("includes the anti-echo directive for a deepseek-configured agent", () => {
    //#given
    const tools = ["ctx_search"]

    //#when
    const agent = createKeymakerAgent(DEEPSEEK, [], tools)

    //#then
    expect(agent.prompt as string).toContain(MARKER)
  })

  test("omits the anti-echo directive for an anthropic-configured agent", () => {
    //#given
    const tools = ["ctx_search"]

    //#when
    const agent = createKeymakerAgent(ANTHROPIC, [], tools)

    //#then
    expect(agent.prompt as string).not.toContain(MARKER)
  })
})
