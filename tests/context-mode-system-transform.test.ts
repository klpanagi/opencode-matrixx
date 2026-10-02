/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { MatrixxConfig } from "../src/config"
import { createContextModeSystemTransformHook } from "../src/features/context-mode-routing"
import { MATRIXX_CONTEXT_MODE_MARKER } from "../src/features/context-mode-routing/routing-block"

const BASE_CONFIG = {
  context_mode: { enabled: true },
} as unknown as MatrixxConfig

function model() {
  return { providerID: "anthropic", modelID: "claude-opus-4-6" } as never
}

describe("createContextModeSystemTransformHook", () => {
  test("injects the routing block at index 1", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a", "sys-b"] }

    //#when
    await hook({ sessionID: "ses_transform_1", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(3)
    expect(output.system[0]).toBe("sys-a")
    expect(output.system[1]).toContain(MATRIXX_CONTEXT_MODE_MARKER)
    expect(output.system[2]).toBe("sys-b")
  })

  test("is idempotent when the same handler is invoked twice", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "ses_transform_2", model: model() }, output)
    await hook({ sessionID: "ses_transform_2", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain(MATRIXX_CONTEXT_MODE_MARKER)
  })

  test("skips injection when the marker is already present", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a", `prior ${MATRIXX_CONTEXT_MODE_MARKER} block`] }

    //#when
    await hook({ sessionID: "ses_transform_3", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toBe(`prior ${MATRIXX_CONTEXT_MODE_MARKER} block`)
  })

  test("fails open without throwing when the output shape is malformed", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = undefined as unknown as { system: string[] }

    //#when
    await hook({ sessionID: "ses_transform_4", model: model() }, output)

    //#then
    expect(output).toBeUndefined()
  })

  test("fails open without throwing when system is not an array", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: "not-an-array" } as unknown as { system: string[] }

    //#when
    await hook({ sessionID: "ses_transform_5", model: model() }, output)

    //#then
    expect(output.system).toBe("not-an-array")
  })

  test("skips injection for an empty sessionID (title-generation calls)", async () => {
    //#given
    const hook = createContextModeSystemTransformHook(BASE_CONFIG)
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "", model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })
})