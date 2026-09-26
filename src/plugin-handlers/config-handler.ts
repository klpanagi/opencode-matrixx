import type { MatrixxConfig } from "../config";
import type { ModelCacheState } from "../plugin-state";
import { log } from "../shared";
import { applyAgentConfig } from "./agent-config-handler";
import { applyCommandConfig } from "./command-config-handler";
import { EMPTY_PLUGIN_COMPONENTS } from "./component-bundle";
import { applyMcpConfig } from "./mcp-config-handler";
import { applyProviderModelLimits } from "./provider-model-limits";
import { applyToolConfig } from "./tool-config-handler";

export { resolveCategoryConfig } from "./category-config-resolver";

export interface ConfigHandlerDeps {
  ctx: { directory: string; client?: unknown };
  pluginConfig: MatrixxConfig;
  modelCacheState: ModelCacheState;
  }

export function createConfigHandler(deps: ConfigHandlerDeps) {
  const { ctx, pluginConfig, modelCacheState } = deps;

  return async (config: Record<string, unknown>) => {
    applyProviderModelLimits({ config, modelCacheState });

    const pluginComponents = EMPTY_PLUGIN_COMPONENTS;

    const agentResult = await applyAgentConfig({
      config,
      pluginConfig,
      ctx,
      pluginComponents,
    });

    applyToolConfig({ config, pluginConfig, agentResult });
    await applyMcpConfig({ config, pluginConfig, pluginComponents });
    await applyCommandConfig({ config, pluginConfig, ctx, pluginComponents });

    log("[config-handler] config handler applied", {
      agentCount: Object.keys(agentResult).length,
      commandCount: Object.keys((config.command as Record<string, unknown>) ?? {})
        .length,
    });
  };
}
