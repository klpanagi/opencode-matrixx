/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import {
  createV1ContextFromV2,
  type V2ContextSource,
} from "../../../src/plugin/v2/context-adapter"
import type { PluginContext } from "../../../src/plugin/types"

function fakeV2Context(overrides: Partial<V2ContextSource> = {}): V2ContextSource {
  return {
    location: {
      directory: "/tmp/matrixx-v2-project",
      project: {
        id: "prj_abc",
        directory: "/tmp/matrixx-v2-project",
        canonical: "/tmp/matrixx-v2-project",
      },
    },
    ...overrides,
  }
}

function endpointStub(url = "http://127.0.0.1:5555") {
  return async () => ({ url: new URL(url), source: "env" as const })
}

describe("createV1ContextFromV2 — location mapping", () => {
  test("maps directory from the V2 location", async () => {
    //#given a V2 context rooted at a project directory
    const source = fakeV2Context()

    //#when
    const adapted = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then
    expect(adapted.ctx.directory).toBe("/tmp/matrixx-v2-project")
  })

  test("derives worktree from the V2 location directory", async () => {
    //#given a V2 context (V2 exposes no worktree on the location used here)
    const source = fakeV2Context()

    //#when
    const adapted = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then the worktree is the project directory, documented in-code
    expect(adapted.ctx.worktree).toBe("/tmp/matrixx-v2-project")
  })

  test("maps project id and worktree from the V2 location project", async () => {
    //#given a V2 context carrying a project identity
    const source = fakeV2Context()

    //#when
    const adapted = await createV1ContextFromV2(source, {
      resolveEndpoint: endpointStub(),
      now: () => 1_700_000_000,
    })

    //#then
    expect(adapted.ctx.project.id).toBe("prj_abc")
    expect(adapted.ctx.project.worktree).toBe("/tmp/matrixx-v2-project")
  })

  test("surfaces the resolved server URL and its provenance", async () => {
    //#given an endpoint resolved from the environment
    const source = fakeV2Context()

    //#when
    const adapted = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then the caller can log exactly how the endpoint was found
    expect(adapted.serverUrl.toString()).toBe("http://127.0.0.1:5555/")
    expect(adapted.serverUrlSource).toBe("env")
    expect(adapted.ctx.serverUrl.toString()).toBe("http://127.0.0.1:5555/")
  })
})

describe("createV1ContextFromV2 — client surface", () => {
  test("exposes the session namespace methods the plugin actually calls", async () => {
    //#given an adapted context
    const source = fakeV2Context()

    //#when
    const { ctx } = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then every session method Matrixx depends on is a callable function
    for (const method of [
      "messages",
      "promptAsync",
      "prompt",
      "todo",
      "status",
      "create",
      "abort",
      "get",
      "summarize",
      "message",
      "delete",
      "children",
      "revert",
    ] as const) {
      expect(typeof ctx.client.session[method]).toBe("function")
    }
  })

  test("exposes the toast and config namespaces V2 has no domain for", async () => {
    //#given an adapted context
    const source = fakeV2Context()

    //#when
    const { ctx } = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then
    expect(typeof ctx.client.tui.showToast).toBe("function")
    expect(typeof ctx.client.config.get).toBe("function")
  })

  test("exposes the model, provider, command and agent lookups", async () => {
    //#given an adapted context
    const source = fakeV2Context()

    //#when
    const { ctx } = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then
    expect(typeof ctx.client.provider.list).toBe("function")
    expect(typeof ctx.client.command.list).toBe("function")
    expect(typeof ctx.client.app.agents).toBe("function")
    expect(typeof ctx.client.config.providers).toBe("function")
  })

  test("returns a distinct client per adapted context", async () => {
    //#given two adapted contexts from the same V2 source
    const source = fakeV2Context()

    //#when
    const first = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })
    const second = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then stateful config injection on one cannot leak into the other
    expect(first.ctx.client).not.toBe(second.ctx.client)
  })
})

describe("createV1ContextFromV2 — BunShell bridge", () => {
  test("exposes a callable shell template with the BunShell methods", async () => {
    //#given an adapted context
    const source = fakeV2Context()

    //#when
    const { ctx } = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then the desktop-notification call sites can use ctx.$`cmd` unchanged
    expect(typeof ctx.$).toBe("function")
    for (const method of ["braces", "escape", "env", "cwd", "nothrow", "throws"] as const) {
      expect(typeof ctx.$[method]).toBe("function")
    }
  })
})

describe("createV1ContextFromV2 — type contract", () => {
  test("satisfies the V1 PluginContext type", async () => {
    //#given an adapted context
    const source = fakeV2Context()

    //#when
    const adapted = await createV1ContextFromV2(source, { resolveEndpoint: endpointStub() })

    //#then it is assignable to the V1 context without any suppression
    const typed: PluginContext = adapted.ctx
    expect(Object.keys(typed).sort()).toEqual(
      ["$", "client", "directory", "project", "serverUrl", "worktree"].sort()
    )
  })
})
