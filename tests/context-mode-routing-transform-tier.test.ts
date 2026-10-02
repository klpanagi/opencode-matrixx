/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { MatrixxConfig } from "../src/config"
import { createTransformHooks } from "../src/plugin/hooks/create-transform-hooks"
import { MATRIXX_CONTEXT_MODE_MARKER } from "../src/features/context-mode-routing/routing-block"

const CTX = {} as never

function buildArgs(pluginConfig: unknown, isHookEnabled: (name: string) => boolean = () => true) {
  return { ctx: CTX, pluginConfig: pluginConfig as MatrixxConfig, isHookEnabled }
}

function model() {
  return { providerID: "anthropic", modelID: "claude-opus-4-6" } as never
}

describe("createTransformHooks — contextModeRouting", () => {
  test("exposes a contextModeRouting system transform handler", () => {
    //#given
    const args = buildArgs({ context_mode: { enabled: true } })

    //#when
    const hooks = createTransformHooks(args)

    //#then
    expect(hooks.contextModeRouting).toBeFunction()
  })

  test("handler injects the routing block into output.system", async () => {
    //#given
    const hooks = createTransformHooks(buildArgs({ context_mode: { enabled: true } }))
    const handler = hooks.contextModeRouting
    if (!handler) throw new Error("contextModeRouting handler missing")
    const output = { system: ["primary"] }

    //#when
    await handler({ sessionID: "ses_abc", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(2)
    expect(output.system[1]).toContain(MATRIXX_CONTEXT_MODE_MARKER)
  })

  test("handler is fail-open and never throws for a missing sessionID", async () => {
    //#given
    const hooks = createTransformHooks(buildArgs({ context_mode: { enabled: true } }))
    const handler = hooks.contextModeRouting
    if (!handler) throw new Error("contextModeRouting handler missing")
    const output = { system: ["primary"] }

    //#when
    await handler({ model: model() }, output)

    //#then
    expect(output.system).toEqual(["primary"])
  })

  test("handler is a no-op when context mode is disabled", async () => {
    //#given
    const hooks = createTransformHooks(buildArgs({ context_mode: { enabled: false } }))
    const handler = hooks.contextModeRouting
    if (!handler) throw new Error("contextModeRouting handler missing")
    const output = { system: ["primary"] }

    //#when
    await handler({ sessionID: "ses_abc", model: model() }, output)

    //#then
    expect(output.system).toEqual(["primary"])
  })
})
