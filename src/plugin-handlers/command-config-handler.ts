import type { MatrixxConfig } from "../config";
import { loadBuiltinCommands } from "../features/builtin-commands";
import {
  loadOpencodeGlobalCommands,
  loadOpencodeProjectCommands,
} from "../features/command-loader";
import {
  discoverConfigSourceSkills,
  loadOpencodeGlobalSkills,
  loadOpencodeProjectSkills,
  skillsToCommandDefinitionRecord,
} from "../features/opencode-skill-loader";
import type { PluginComponents } from "./plugin-components-loader";

export async function applyCommandConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: MatrixxConfig;
  ctx: { directory: string };
  pluginComponents: PluginComponents;
}): Promise<void> {
  const builtinCommands = loadBuiltinCommands(params.pluginConfig.disabled_commands);
  const systemCommands = (params.config.command as Record<string, unknown>) ?? {};

  // claude_code flags removed during CC compat removal

  const [
    configSourceSkills,
    opencodeGlobalCommands,
    opencodeProjectCommands,
    opencodeGlobalSkills,
    opencodeProjectSkills,
  ] = await Promise.all([
    discoverConfigSourceSkills({
      config: params.pluginConfig.skills,
      configDir: params.ctx.directory,
    }),
    loadOpencodeGlobalCommands(),
    loadOpencodeProjectCommands(params.ctx.directory),
    loadOpencodeGlobalSkills(),
    loadOpencodeProjectSkills(params.ctx.directory),
  ]);

  params.config.command = {
    ...builtinCommands,
    ...skillsToCommandDefinitionRecord(configSourceSkills),
    ...opencodeGlobalCommands,
    ...opencodeGlobalSkills,
    ...systemCommands,
    ...opencodeProjectCommands,
    ...opencodeProjectSkills,
    ...params.pluginComponents.commands,
    ...params.pluginComponents.skills,
  };
}
