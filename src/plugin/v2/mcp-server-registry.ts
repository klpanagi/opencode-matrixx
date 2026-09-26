import type { MatrixxConfig } from "../../config"
import { createBuiltinMcps } from "../../mcp"
import { log } from "../../shared"
import type { V2McpServerConfig } from "./component-types"

type RemoteMcpEntry = {
  type: "remote"
  url: string
  enabled: boolean
  headers?: Record<string, string>
  oauth?: false
}

type LocalMcpEntry = {
  type: "local"
  command: string[]
  enabled: boolean
}

export type McpEntryLike = RemoteMcpEntry | LocalMcpEntry

type ConfiguredServer = {
  type?: "local" | "remote"
  command?: string[] | string
  args?: string[]
  url?: string
  disabled?: boolean
  enabled?: boolean
  environment?: Record<string, string>
  env?: Record<string, string>
  headers?: Record<string, string>
  oauth?: Record<string, unknown> | false
  codemode?: boolean
  protocol?: "legacy" | "auto" | "2026-07-28"
  timeout?: { startup?: number; catalog?: number; execution?: number }
}

function isLocal(entry: { type?: string; command?: unknown }): boolean {
  if (entry.type) return entry.type === "local";
  return Array.isArray(entry.command) || typeof entry.command === "string";
}

function commandOf(entry: ConfiguredServer): string[] {
  if (Array.isArray(entry.command)) return entry.command;
  if (typeof entry.command === "string") return [entry.command, ...(entry.args ?? [])];
  return [];
}

/**
 * V2 `disabled` is the inverse of the V1 `enabled` flag. When both are present
 * the V2-native field wins.
 */
function disabledOf(entry: ConfiguredServer, v1Enabled?: boolean): boolean | undefined {
  if (typeof entry.disabled === "boolean") return entry.disabled;
  if (typeof entry.enabled === "boolean") return !entry.enabled;
  if (typeof v1Enabled === "boolean") return !v1Enabled;
  return undefined;
}

function toV2Local(entry: ConfiguredServer, v1Enabled?: boolean): V2McpServerConfig {
  const disabled = disabledOf(entry, v1Enabled);
  return {
    type: "local",
    command: commandOf(entry),
    ...(disabled === undefined ? {} : { disabled }),
    ...(entry.environment ?? entry.env
      ? { environment: entry.environment ?? entry.env }
      : {}),
    ...(entry.codemode === undefined ? {} : { codemode: entry.codemode }),
    ...(entry.protocol === undefined ? {} : { protocol: entry.protocol }),
    ...(entry.timeout === undefined ? {} : { timeout: entry.timeout }),
  };
}

function toV2Remote(entry: ConfiguredServer, v1Enabled?: boolean): V2McpServerConfig {
  const disabled = disabledOf(entry, v1Enabled);
  return {
    type: "remote",
    url: entry.url ?? "",
    ...(disabled === undefined ? {} : { disabled }),
    ...(entry.headers ? { headers: entry.headers } : {}),
    ...(entry.oauth === undefined ? {} : { oauth: entry.oauth }),
    ...(entry.codemode === undefined ? {} : { codemode: entry.codemode }),
    ...(entry.protocol === undefined ? {} : { protocol: entry.protocol }),
    ...(entry.timeout === undefined ? {} : { timeout: entry.timeout }),
  };
}

/**
 * Maps a neutral MCP entry — either a V1 built-in record or a `mcp.servers.*`
 * config entry — onto the V2 `Mcp.ServerConfig` shape. `enabled` is inverted
 * into `disabled`, `env` is renamed to `environment`, and a bare `command`
 * string is joined with its `args`. V2 fields always beat their V1 aliases.
 */
export function toV2McpServerConfig(
  entry: McpEntryLike | ConfiguredServer,
): V2McpServerConfig {
  const configured = entry as ConfiguredServer;
  const v1 = "enabled" in entry ? (entry.enabled as boolean) : undefined;
  return isLocal(configured) ? toV2Local(configured, v1) : toV2Remote(configured, v1);
}

/**
 * Resolves the full V2 server set: the three built-ins (with the same
 * `disabled_mcps` and startup-failure handling as V1) overlaid by the user's
 * `mcp.servers.*` entries, which win on name collision per the dual-config
 * precedence recorded in the migration notepad.
 */
export function resolveV2McpServers(
  pluginConfig: MatrixxConfig,
): Map<string, V2McpServerConfig> {
  const disabled = new Set(pluginConfig.disabled_mcps ?? []);
  const { mcps, failures } = createBuiltinMcps([...disabled], pluginConfig);

  const servers = new Map<string, V2McpServerConfig>();
  for (const [name, entry] of Object.entries(mcps)) {
    servers.set(name, toV2McpServerConfig(entry as McpEntryLike));
  }
  for (const [name, entry] of Object.entries(pluginConfig.mcp?.servers ?? {})) {
    if (disabled.has(name)) continue;
    servers.set(name, toV2McpServerConfig(entry));
  }
  for (const name of disabled) {
    servers.delete(name);
  }
  if (failures.length > 0) {
    log("[resolveV2McpServers] MCP startup issues detected", {
      failures: failures.map((failure) => `${failure.name}: ${failure.error}`).join("; "),
    });
  }
  return servers;
}

/**
 * The V2-canonical MCP tool name is `<server>_<tool>`.
 */
export function mcpToolName(server: string, tool: string): string {
  return `${server}_${tool}`;
}

/**
 * Every spelling a host runtime may expose for one MCP tool: the V2
 * single-underscore name first, then the V1 double-underscore name. Call sites
 * that gate on tool names (agent allowlists, prompt strings) must accept all of
 * them so V1 keeps working until the V2 gate passes.
 */
export function mcpToolNameAliases(server: string, tool: string): string[] {
  return [mcpToolName(server, tool), `${server}__${tool}`];
}
