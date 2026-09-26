/**
 * The bundle of components contributed by *other* plugins, merged into the
 * Matrixx-owned config by the agent/command/mcp config handlers. Plugin
 * discovery is still unimplemented, so `EMPTY_PLUGIN_COMPONENTS` remains the
 * V1-path bundle. On the V2 path `register-components.ts` builds its own bundle
 * with `mcpServers` populated from the V2 MCP registry, so the merge point is
 * live there rather than a dead seam.
 */
export type PluginComponents = {
  commands: Record<string, unknown>;
  skills: Record<string, unknown>;
  agents: Record<string, unknown>;
  mcpServers: Record<string, unknown>;
  hooksConfigs: Array<{ hooks?: Record<string, unknown> }>;
  plugins: Array<{ name: string; version: string }>;
  errors: Array<{ pluginKey: string; installPath: string; error: string }>;
};

export const EMPTY_PLUGIN_COMPONENTS: PluginComponents = {
  commands: {},
  skills: {},
  agents: {},
  mcpServers: {},
  hooksConfigs: [],
  plugins: [],
  errors: [],
};
