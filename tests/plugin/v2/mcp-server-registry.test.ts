/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { MatrixxConfig } from "../../../src/config"
import {
  mcpToolName,
  mcpToolNameAliases,
  resolveV2McpServers,
  toV2McpServerConfig,
} from "../../../src/plugin/v2/mcp-server-registry"

function config(overrides: Partial<MatrixxConfig> = {}): MatrixxConfig {
  return {
    disabled_agents: [],
    disabled_skills: [],
    disabled_commands: [],
    ...overrides,
  } as MatrixxConfig
}

describe("toV2McpServerConfig — built-in V1 entries", () => {
  test("inverts the V1 `enabled` flag into the V2 `disabled` flag for remote servers", () => {
    //#given
    const entry = { type: "remote", url: "https://example.test/mcp", enabled: true, oauth: false } as const

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect(result).toEqual({
      type: "remote",
      url: "https://example.test/mcp",
      disabled: false,
      oauth: false,
    })
  })

  test("marks a V1 disabled local server as `disabled` and keeps its command array", () => {
    //#given
    const entry = { type: "local", command: ["uvx", "pkg"], enabled: false } as const

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect(result).toEqual({ type: "local", command: ["uvx", "pkg"], disabled: true })
  })
})

describe("toV2McpServerConfig — mcp.servers.* config entries", () => {
  test("maps the V1-shaped `env` alias onto the V2 `environment` field", () => {
    //#given
    const entry = { type: "local", command: "uvx", args: ["pkg"], env: { TOKEN: "abc" } }

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect(result).toEqual({
      type: "local",
      command: ["uvx", "pkg"],
      environment: { TOKEN: "abc" },
    })
  })

  test("maps the V1-shaped `enabled` alias onto the V2 `disabled` field", () => {
    //#given
    const entry = { type: "remote", url: "https://example.test/mcp", enabled: false }

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect((result as { disabled: boolean }).disabled).toBe(true)
  })

  test("prefers the V2 `disabled` field over the V1 `enabled` alias when both are present", () => {
    //#given
    const entry = { type: "remote", url: "https://example.test/mcp", enabled: true, disabled: true }

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect((result as { disabled: boolean }).disabled).toBe(true)
  })

  test("passes snake_case OAuth keys straight through", () => {
    //#given
    const entry = {
      type: "remote",
      url: "https://example.test/mcp",
      oauth: {
        client_id: "cid",
        client_secret: "secret",
        scope: "read",
        callback_port: 8976,
        redirect_uri: "http://localhost:8976/cb",
        auth_server_metadata_url: "https://example.test/.well-known",
      },
    }

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect((result as { oauth: unknown }).oauth).toEqual({
      client_id: "cid",
      client_secret: "secret",
      scope: "read",
      callback_port: 8976,
      redirect_uri: "http://localhost:8976/cb",
      auth_server_metadata_url: "https://example.test/.well-known",
    })
  })

  test("drops `oauth: false` on a local server, which has no OAuth field", () => {
    //#given
    const entry = { type: "local", command: ["uvx"], oauth: false }

    //#when
    const result = toV2McpServerConfig(entry)

    //#then
    expect(result).toEqual({ type: "local", command: ["uvx"] })
  })
})

describe("resolveV2McpServers", () => {
  test("registers all three built-in servers when nothing is disabled", () => {
    //#given
    const pluginConfig = config({ disabled_mcps: [] })

    //#when
    const servers = resolveV2McpServers(pluginConfig)

    //#then
    expect([...servers.keys()].sort()).toEqual(["context7", "document_reader", "websearch"])
  })

  test("honors `disabled_mcps` for built-ins", () => {
    //#given
    const pluginConfig = config({ disabled_mcps: ["websearch", "context7", "document_reader"] })

    //#when
    const servers = resolveV2McpServers(pluginConfig)

    //#then
    expect(servers.size).toBe(0)
  })

  test("adds a user server declared under `mcp.servers`", () => {
    //#given
    const pluginConfig = config({
      mcp: {
        servers: {
          internal: { type: "remote", url: "https://internal.test/mcp" },
        },
      },
    })

    //#when
    const servers = resolveV2McpServers(pluginConfig)

    //#then
    expect(servers.get("internal")).toEqual({
      type: "remote",
      url: "https://internal.test/mcp",
    })
  })

  test("lets a `mcp.servers` entry override a same-named built-in", () => {
    //#given
    const pluginConfig = config({
      mcp: { servers: { context7: { type: "remote", url: "https://mirror.test/mcp" } } },
    })

    //#when
    const servers = resolveV2McpServers(pluginConfig)

    //#then
    expect(servers.get("context7")).toEqual({ type: "remote", url: "https://mirror.test/mcp" })
  })

  test("drops a `mcp.servers` entry listed in `disabled_mcps`", () => {
    //#given
    const pluginConfig = config({
      disabled_mcps: ["internal"],
      mcp: { servers: { internal: { type: "remote", url: "https://internal.test/mcp" } } },
    })

    //#when
    const servers = resolveV2McpServers(pluginConfig)

    //#then
    expect(servers.has("internal")).toBe(false)
  })
})

describe("mcp tool name contract", () => {
  test("builds the V2-canonical `<server>_<tool>` name", () => {
    //#given
    const server = "document_reader"
    const tool = "convert_to_markdown"

    //#when
    const name = mcpToolName(server, tool)

    //#then
    expect(name).toBe("document_reader_convert_to_markdown")
  })

  test("exposes the V1 double-underscore spelling as an alias so V1 keeps working", () => {
    //#given
    const server = "document_reader"
    const tool = "convert_to_markdown"

    //#when
    const aliases = mcpToolNameAliases(server, tool)

    //#then
    expect(aliases).toEqual([
      "document_reader_convert_to_markdown",
      "document_reader__convert_to_markdown",
    ])
  })
})
