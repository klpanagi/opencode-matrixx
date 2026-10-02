/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { MatrixxConfig } from "../../config"
import { buildContextModeRoutingBlock, MATRIXX_CONTEXT_MODE_MARKER } from "./routing-block"
import { createContextModeSystemTransformHook } from "./system-transform"

const BASE_CONFIG = {
  context_mode: { enabled: true },
} as unknown as MatrixxConfig

function model() {
  return { providerID: "anthropic", modelID: "claude-opus-4-6" } as never
}

describe("buildContextModeRoutingBlock", () => {
  test("opens with the Matrixx marker and closes it", () => {
    //#given
    //#when
    const block = buildContextModeRoutingBlock()
    //#then
    expect(block).toStartWith(MATRIXX_CONTEXT_MODE_MARKER)
    expect(block).toEndWith("</context_window_protection>")
  })

  test("contains the upstream hierarchy sections and Matrixx carve-outs", () => {
    //#given
    //#when
    const block = buildContextModeRoutingBlock()
    //#then
    expect(block).toContain("<tool_selection_hierarchy>")
    expect(block).toContain("<when_not_to_use>")
    expect(block).toContain("<file_writing_policy>")
    expect(block).toContain("<session_continuity>")
    // T3 carve-outs
    expect(block).toContain("Read is CORRECT when you intend to Edit")
    expect(block).toContain("OBSERVE")
    expect(block).toContain("MUTATE")
    expect(block).toContain("ctx_execute_file")
    expect(block).toContain("ctx_fetch_and_index")
  })
})

describe("createContextModeSystemTransformHook", () => {
  test("inserts the routing block at index 1", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a", "sys-b"] }
    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)
    //#then
    expect(output.system).toHaveLength(3)
    expect(output.system[0]).toBe("sys-a")
    expect(output.system[1]).toContain(MATRIXX_CONTEXT_MODE_MARKER)
    expect(output.system[2]).toBe("sys-b")
  })

  test("skips when context_mode is disabled", async () => {
    //#given
    const hook = createContextModeSystemTransformHook({
      context_mode: { enabled: false },
    } as unknown as MatrixxConfig)
    const output = { system: ["sys-a"] }
    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)
    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("is idempotent when the marker is already present", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a", `prior ${MATRIXX_CONTEXT_MODE_MARKER} block`], another: 1 }
    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)
    //#then
    expect(output.system).toHaveLength(2)
  })

  test("skips when sessionID is absent (title-generation calls)", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a"] }
    //#when
    await hook({ model: model() }, output)
    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("never throws on malformed output (fail-open)", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = undefined as unknown as { system: string[] }
    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)
    //#then
    expect(output).toBeUndefined()
  })
})