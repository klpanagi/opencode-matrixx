/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { DEFAULT_SERVER_PORT, resolveServerEndpoint } from "../../../src/plugin/v2/server-endpoint"

describe("resolveServerEndpoint", () => {
  test("prefers the explicit server URL environment variable", async () => {
    //#given an env that names the host plus a discovery probe that would disagree
    const env = { OPENCODE_SERVER_URL: "http://127.0.0.1:5555" }
    const discover = async (): Promise<{ url: string } | undefined> => ({ url: "http://127.0.0.1:9999" })

    //#when the endpoint is resolved
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then the explicit env wins and its provenance is reported
    expect(endpoint.url.toString()).toBe("http://127.0.0.1:5555/")
    expect(endpoint.source).toBe("env")
  })

  test("falls back to the registered local service endpoint", async () => {
    //#given no explicit env, but a registered local service
    const env: Record<string, string | undefined> = {}
    const discover = async (): Promise<{ url: string } | undefined> => ({ url: "http://127.0.0.1:7777" })

    //#when
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then the discovered endpoint is used and labelled as such
    expect(endpoint.url.toString()).toBe("http://127.0.0.1:7777/")
    expect(endpoint.source).toBe("discovered")
  })

  test("degrades to the port fallback when discovery finds nothing", async () => {
    //#given neither an env URL nor a registered service
    const env: Record<string, string | undefined> = {}
    const discover = async (): Promise<{ url: string } | undefined> => undefined

    //#when
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then the fallback is used and the degradation is visible in the source
    expect(endpoint.url.toString()).toBe(`http://localhost:${DEFAULT_SERVER_PORT}/`)
    expect(endpoint.source).toBe("port-fallback")
  })

  test("honours an explicit OPENCODE_PORT override for the fallback", async () => {
    //#given only a port override
    const env = { OPENCODE_PORT: "7000" }
    const discover = async (): Promise<{ url: string } | undefined> => undefined

    //#when
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then
    expect(endpoint.url.toString()).toBe("http://localhost:7000/")
    expect(endpoint.source).toBe("port-fallback")
  })

  test("survives a discovery probe that throws", async () => {
    //#given a discovery probe that rejects instead of resolving
    const env: Record<string, string | undefined> = {}
    const discover = async (): Promise<{ url: string } | undefined> => {
      throw new Error("registry unreadable")
    }

    //#when
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then the resolver degrades to the port fallback instead of throwing
    expect(endpoint.source).toBe("port-fallback")
  })

  test("ignores a malformed env URL and degrades to the port fallback", async () => {
    //#given an unparseable env value
    const env = { OPENCODE_SERVER_URL: "not a url" }
    const discover = async (): Promise<{ url: string } | undefined> => undefined

    //#when
    const endpoint = await resolveServerEndpoint({ env, discover })

    //#then a broken env var cannot take the adapter down
    expect(endpoint.url.toString()).toBe(`http://localhost:${DEFAULT_SERVER_PORT}/`)
    expect(endpoint.source).toBe("port-fallback")
  })
})
