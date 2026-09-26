/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { McpConfigSchema, McpServerConfigSchema } from "../../src/config"

describe("McpOAuthConfigSchema", () => {
  test("accepts the snake_case OAuth keys used by the V2 runtime", () => {
    //#given
    const oauth = {
      client_id: "cid",
      client_secret: "secret",
      scope: "read",
      callback_port: 8976,
      redirect_uri: "http://localhost:8976/cb",
      auth_server_metadata_url: "https://example.test/.well-known",
    }

    //#when
    const result = McpServerConfigSchema.safeParse({
      type: "remote",
      url: "https://example.test/mcp",
      oauth,
    })

    //#then
    expect(result.success).toBe(true)
  })

  test("rejects camelCase OAuth keys so the V2 spelling is enforced", () => {
    //#given
    const oauth = { clientId: "cid", clientSecret: "secret" }

    //#when
    const result = McpServerConfigSchema.safeParse({
      type: "remote",
      url: "https://example.test/mcp",
      oauth,
    })

    //#then
    expect(result.success).toBe(false)
  })

  test("accepts the literal `false` OAuth opt-out", () => {
    //#given
    const entry = { type: "remote", url: "https://example.test/mcp", oauth: false }

    //#when
    const result = McpServerConfigSchema.safeParse(entry)

    //#then
    expect(result.success).toBe(true)
  })
})

describe("McpServerConfigSchema — additive V2 fields", () => {
  test("accepts the V2-native `environment`, `disabled` and `protocol` fields", () => {
    //#given
    const entry = {
      type: "local",
      command: ["uvx", "pkg"],
      environment: { TOKEN: "abc" },
      disabled: false,
      protocol: "auto",
      codemode: true,
    }

    //#when
    const result = McpServerConfigSchema.safeParse(entry)

    //#then
    expect(result.success).toBe(true)
  })

  test("still accepts the V1-shaped `env` and `enabled` aliases", () => {
    //#given
    const entry = { type: "local", command: "uvx", args: ["pkg"], env: { A: "b" }, enabled: true }

    //#when
    const result = McpServerConfigSchema.safeParse(entry)

    //#then
    expect(result.success).toBe(true)
  })
})

describe("McpConfigSchema", () => {
  test("is fully optional — an absent `mcp` key changes no default", () => {
    //#given
    const empty = {}

    //#when
    const result = McpConfigSchema.safeParse(empty)

    //#then
    expect(result.success).toBe(true)
  })

  test("exposes a `servers` record keyed by server name", () => {
    //#given
    const entry = { servers: { internal: { type: "remote", url: "https://internal.test/mcp" } } }

    //#when
    const result = McpConfigSchema.safeParse(entry)

    //#then
    expect(result.success).toBe(true)
  })
})
