/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import MatrixxPlugin from "../../src/index"
import { isV2PluginContext } from "../../src/plugin/tool-gating"

describe("dual-shape plugin entry", () => {
  test("default export is callable as a V1 plugin", () => {
    //#given
    const entry: unknown = MatrixxPlugin

    //#when
    const isCallable = typeof entry === "function"

    //#then
    expect(isCallable).toBe(true)
  })

  test("default export exposes the V2 plugin id", () => {
    //#given
    const entry = MatrixxPlugin as { id?: unknown }

    //#when
    const id = entry.id

    //#then
    expect(id).toBe("matrixx")
  })

  test("default export exposes a V2 setup function", () => {
    //#given
    const entry = MatrixxPlugin as { setup?: unknown }

    //#when
    const setupType = typeof entry.setup

    //#then
    expect(setupType).toBe("function")
  })

  test("dual shape can be probed without throwing", () => {
    //#given
    const entry = MatrixxPlugin as unknown as { id: string; setup: unknown }

    //#when
    const probe = () => ({ id: entry.id, setup: entry.setup })

    //#then
    expect(probe).not.toThrow()
  })
})

describe("isV2PluginContext", () => {
  test("returns true for a V2-shaped context", () => {
    //#given
    const v2ctx = {
      location: { directory: "/tmp/project" },
      tool: { hook: () => {} },
      session: { hook: () => {} },
    }

    //#when
    const result = isV2PluginContext(v2ctx)

    //#then
    expect(result).toBe(true)
  })

  test("returns false for a V1-shaped context", () => {
    //#given
    const v1ctx = {
      directory: "/tmp/project",
      client: {},
      serverUrl: new URL("http://localhost:1234"),
    }

    //#when
    const result = isV2PluginContext(v1ctx)

    //#then
    expect(result).toBe(false)
  })

  test("returns false for null and primitives", () => {
    //#given / #when / #then
    expect(isV2PluginContext(null)).toBe(false)
    expect(isV2PluginContext(undefined)).toBe(false)
    expect(isV2PluginContext("v2")).toBe(false)
  })
})
