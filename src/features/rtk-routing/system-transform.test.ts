/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { MatrixxConfig } from "../../config"
import {
  containsContextModeMarker,
  MATRIXX_CONTEXT_MODE_MARKER,
} from "../context-mode-routing/routing-block"
import { createContextModeSystemTransformHook as createCtxHook } from "../context-mode-routing/system-transform"
import { containsRtkMarker, MATRIXX_RTK_MARKER } from "./routing-block"
import { createRtkSystemTransformHook } from "./system-transform"

function model() {
  return { providerID: "anthropic", modelID: "claude-opus-4-6" } as never
}

function rtkConfig(enabled: boolean): MatrixxConfig {
  return { rtk: { enabled, timeout_ms: 5000 } } as unknown as MatrixxConfig
}

function ctxConfig(enabled: boolean): MatrixxConfig {
  return { context_mode: { enabled } } as unknown as MatrixxConfig
}

function bothConfig(): MatrixxConfig {
  return {
    rtk: { enabled: true, timeout_ms: 5000 },
    context_mode: { enabled: true },
  } as unknown as MatrixxConfig
}

describe("createRtkSystemTransformHook guard matrix", () => {
  test("row 2: enabled but binary missing does not inject", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => null,
      hasBash: () => true,
    })
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("row 3: hook disabled does not inject", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hookEnabled: false,
      hasBash: () => true,
    })
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("row 1: disabled config does not inject", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(false), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("row 4: active config inserts the routing block at index 1", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["sys-a", "sys-b"] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(3)
    expect(output.system[0]).toBe("sys-a")
    expect(output.system[1]).toContain(MATRIXX_RTK_MARKER)
    expect(output.system[2]).toBe("sys-b")
  })
})

describe("createRtkSystemTransformHook suppression and safety", () => {
  test("suppresses the block for agents known to lack bash", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => false,
    })
    const output = { system: ["sys-a"] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("is idempotent when the marker is already present", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["sys-a", `prior ${MATRIXX_RTK_MARKER} block`] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(2)
  })

  test("skips when sessionID is absent (title-generation calls)", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["sys-a"] }

    //#when
    await hook({ model: model() }, output)

    //#then
    expect(output.system).toEqual(["sys-a"])
  })

  test("never throws on malformed output (fail-open)", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = undefined as unknown as { system: string[] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output).toBeUndefined()
  })

  test("never throws when system is not an array (fail-open)", async () => {
    //#given
    const hook = createRtkSystemTransformHook(rtkConfig(true), {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: "not-an-array" } as unknown as { system: string[] }

    //#when
    await hook({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system as unknown).toBe("not-an-array")
  })
})

describe("rtk + ctx coexistence", () => {
  test("both transforms compose as [primary, RTK, CTX, ...]", async () => {
    //#given
    const config = bothConfig()
    const ctxTransform = createCtxHook(ctxConfig(true))
    const rtkTransform = createRtkSystemTransformHook(config, {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["primary", "rest"] }

    //#when
    await ctxTransform({ sessionID: "ses_1", model: model() }, output)
    await rtkTransform({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(output.system).toHaveLength(4)
    expect(output.system[0]).toBe("primary")
    expect(output.system[1]).toContain(MATRIXX_RTK_MARKER)
    expect(output.system[2]).toContain(MATRIXX_CONTEXT_MODE_MARKER)
    expect(output.system[3]).toBe("rest")
  })

  test("each detector fires only on its own marker", async () => {
    //#given
    const config = bothConfig()
    const ctxTransform = createCtxHook(ctxConfig(true))
    const rtkTransform = createRtkSystemTransformHook(config, {
      which: () => "/usr/bin/rtk",
      hasBash: () => true,
    })
    const output = { system: ["primary", "rest"] }

    //#when
    await ctxTransform({ sessionID: "ses_1", model: model() }, output)
    await rtkTransform({ sessionID: "ses_1", model: model() }, output)

    //#then
    expect(containsRtkMarker(output.system)).toBe(true)
    expect(containsContextModeMarker(output.system)).toBe(true)
    expect(containsRtkMarker([output.system[2]])).toBe(false)
    expect(containsContextModeMarker([output.system[1]])).toBe(false)
  })
})
