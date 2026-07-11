import type { MatrixxConfig } from "../config";

export type PluginComponents = {
  commands: Record<string, unknown>;
  skills: Record<string, unknown>;
  agents: Record<string, unknown>;
  mcpServers: Record<string, unknown>;
  hooksConfigs: Array<{ hooks?: Record<string, unknown> }>;
  plugins: Array<{ name: string; version: string }>;
  errors: Array<{ pluginKey: string; installPath: string; error: string }>;
};

const EMPTY_PLUGIN_COMPONENTS: PluginComponents = {
  commands: {},
  skills: {},
  agents: {},
  mcpServers: {},
  hooksConfigs: [],
  plugins: [],
  errors: [],
};

export async function loadPluginComponents(_params: {
  pluginConfig: MatrixxConfig;
}): Promise<PluginComponents> {
  return EMPTY_PLUGIN_COMPONENTS;
}
