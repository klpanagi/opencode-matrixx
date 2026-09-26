/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { ToolContext } from "@opencode-ai/plugin/tool"
import { z } from "zod"

import { toV1ToolDefinition, toV1ToolsRecord } from "../../src/plugin/tool-definition"
import { registerV2Tools } from "../../src/plugin/tool-registry"
import type { V2PluginContext, V2ToolDefinition, V2ToolsRecord } from "../../src/plugin/types"

function makeV1Context(): ToolContext {
  return {
    sessionID: "ses_test",
    messageID: "msg_test",
    agent: "mouse",
    directory: "/tmp/project",
    worktree: "/tmp/project",
    abort: new AbortController().signal,
    metadata: () => {},
    ask: async () => {},
  }
}

function makeV2Tool(overrides?: Partial<V2ToolDefinition>): V2ToolDefinition {
  return {
    name: "demo_tool",
    description: "A demo tool",
    input: z.object({ value: z.string() }),
    execute: async (input) => ({ content: `got:${String(input.value)}` }),
    ...overrides,
  }
}

function makeFakeV2Context(added: V2ToolDefinition[], registration: { dispose: () => void }): V2PluginContext {
  const fake = {
    tool: {
      transform: async (callback: (editor: { add: (tool: V2ToolDefinition) => void }) => void) => {
        callback({ add: (tool) => added.push(tool) })
        return registration
      },
    },
  }
  return fake as unknown as V2PluginContext
}

describe("V2 tool contract", () => {
  test("exposes name, description, input schema and execute", () => {
    //#given
    const tool = makeV2Tool()

    //#when
    const shape = {
      name: tool.name,
      description: tool.description,
      hasInput: typeof tool.input === "object" && tool.input !== null,
      execute: typeof tool.execute,
    }

    //#then
    expect(shape.name).toBe("demo_tool")
    expect(shape.description).toBe("A demo tool")
    expect(shape.hasInput).toBe(true)
    expect(shape.execute).toBe("function")
  })
})

describe("toV1ToolDefinition", () => {
  test("maps name/description and forwards execute output", async () => {
    //#given
    const v2Tool = makeV2Tool()
    const v1Tool = toV1ToolDefinition(v2Tool)

    //#when
    const result = await v1Tool.execute({ value: "x" }, makeV1Context())

    //#then
    expect(v1Tool.description).toBe("A demo tool")
    expect(result).toBe("got:x")
  })

  test("exposes the zod raw shape as V1 args", () => {
    //#given
    const v2Tool = makeV2Tool({
      input: z.object({ value: z.string(), count: z.number() }),
    })

    //#when
    const v1Tool = toV1ToolDefinition(v2Tool)

    //#then
    expect(Object.keys(v1Tool.args).sort()).toEqual(["count", "value"])
  })

  test("returns empty args when the input schema has no shape", () => {
    //#given
    const schemaWithoutShape = { "~standard": { version: 1, vendor: "test" } }
    const v2Tool = makeV2Tool({ input: schemaWithoutShape as unknown as V2ToolDefinition["input"] })

    //#when
    const v1Tool = toV1ToolDefinition(v2Tool)

    //#then
    expect(Object.keys(v1Tool.args)).toEqual([])
  })

  test("stringifies an object output result", async () => {
    //#given
    const v2Tool = makeV2Tool({ execute: async () => ({ output: { a: 1 } }) })
    const v1Tool = toV1ToolDefinition(v2Tool)

    //#when
    const result = await v1Tool.execute({}, makeV1Context())

    //#then
    expect(result).toBe(JSON.stringify({ a: 1 }))
  })

  test("joins text content array results with newlines", async () => {
    //#given
    const v2Tool = makeV2Tool({
      execute: async () => ({
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      }),
    })
    const v1Tool = toV1ToolDefinition(v2Tool)

    //#when
    const result = await v1Tool.execute({}, makeV1Context())

    //#then
    expect(result).toBe("first\nsecond")
  })

  test("toV1ToolsRecord converts a record keyed by tool name", () => {
    //#given
    const tools: V2ToolsRecord = {
      alpha: makeV2Tool({ name: "alpha" }),
      beta: makeV2Tool({ name: "beta" }),
    }

    //#when
    const converted = toV1ToolsRecord(tools)

    //#then
    expect(Object.keys(converted).sort()).toEqual(["alpha", "beta"])
    expect(converted.alpha.description).toBe("A demo tool")
  })
})

describe("registerV2Tools", () => {
  test("registers each tool via ctx.tool.transform using its name", async () => {
    //#given
    const added: V2ToolDefinition[] = []
    const registration = { dispose: () => {} }
    const ctx = makeFakeV2Context(added, registration)
    const tools: V2ToolsRecord = {
      first: makeV2Tool({ name: "alpha" }),
      second: makeV2Tool({ name: "beta" }),
    }

    //#when
    await registerV2Tools(ctx, tools)

    //#then
    expect(added.map((tool) => tool.name)).toEqual(["alpha", "beta"])
  })

  test("returns the registration produced by transform", async () => {
    //#given
    const added: V2ToolDefinition[] = []
    const registration = { dispose: () => {} }
    const ctx = makeFakeV2Context(added, registration)

    //#when
    const result = await registerV2Tools(ctx, { only: makeV2Tool({ name: "only" }) })

    //#then
    expect(result).toBe(registration)
  })

  test("delegates registration ordering to the transform callback", async () => {
    //#given
    const added: V2ToolDefinition[] = []
    let captured: ((editor: { add: (tool: V2ToolDefinition) => void }) => void) | undefined
    const ctx = {
      tool: {
        transform: async (
          callback: (editor: { add: (tool: V2ToolDefinition) => void }) => void,
        ) => {
          captured = callback
          return { dispose: () => {} }
        },
      },
    } as unknown as V2PluginContext
    const tools: V2ToolsRecord = { deferred: makeV2Tool({ name: "deferred" }) }

    //#when
    await registerV2Tools(ctx, tools)

    //#then
    expect(added).toHaveLength(0)
    captured?.({ add: (tool) => added.push(tool) })
    expect(added.map((tool) => tool.name)).toEqual(["deferred"])
  })

  test("registers nothing for an empty tools record", async () => {
    //#given
    const added: V2ToolDefinition[] = []
    const ctx = makeFakeV2Context(added, { dispose: () => {} })

    //#when
    await registerV2Tools(ctx, {})

    //#then
    expect(added).toHaveLength(0)
  })
})
