import { join } from "node:path"

import type { MatrixxConfig } from "../../config"
import { loadBuiltinCommands } from "../../features/builtin-commands"
import { createBuiltinSkills } from "../../features/builtin-skills"
import {
  applyAgentConfig,
  setAvailableToolNames,
} from "../../plugin-handlers/agent-config-handler"
import type { PluginComponents } from "../../plugin-handlers/component-bundle"
import { log } from "../../shared"
import { partitionAgentsForV2 } from "./agent-partition"
import {
  toV2AgentFields,
  toV2CommandDefinition,
  toV2SkillInfo,
} from "./component-mappers"
import type {
  V2CommandDefinition,
  V2ComponentRegistrar,
  V2ComponentRegistration,
  V2McpServerConfig,
  V2SkillInfo,
} from "./component-types"
import { resolveV2McpServers } from "./mcp-server-registry"

export type V2ComponentDeps = {
  pluginConfig: MatrixxConfig;
  directory: string;
  /** Tool names known to the V2 runtime, forwarded to the shared agent-prompt cache. */
  availableToolNames?: string[];
  client?: unknown;
};

export type V2ComponentCleanup = () => Promise<void>;

const BUILTIN_SKILL_SOURCE_DIR = ".matrixx/builtin-skills";

/**
 * Registers the Matrixx agent/skill/command/MCP surface on the V2 runtime from
 * the SAME neutral registries the V1 `config` hook consumes, so the two paths
 * cannot drift. Each domain gets a `transform` followed by a `reload`, and every
 * returned `Registration` is disposed LIFO by the returned cleanup.
 */
export async function registerV2Components(
  ctx: V2ComponentRegistrar,
  deps: V2ComponentDeps,
): Promise<V2ComponentCleanup> {
  const registrations: V2ComponentRegistration[] = []
  const { skills, commands, mcpServers, agents, defaultAgent } =
    await resolveComponents(ctx, deps)

  registrations.push(
    await ctx.agent.transform((editor) => {
      const { refined, unresolvable } = partitionAgentsForV2(agents, editor)
      for (const [id, fields] of refined) {
        editor.update(id, (agent) => Object.assign(agent, fields))
      }
      if (defaultAgent) editor.default(defaultAgent)
      if (unresolvable.length > 0) {
        log(
          "[registerV2Components] V2 AgentEditor exposes no add(); unresolvable agents were not introduced",
          { unresolvable: unresolvable.map(([id]) => id) },
        )
      }
    }),
  )
  await ctx.agent.reload()

  registrations.push(
    await ctx.skill.transform((editor) => {
      for (const skill of skills) {
        if (editor.get(skill.name)) continue
        editor.add(skill)
      }
    }),
  )
  await ctx.skill.reload()

  registrations.push(
    await ctx.command.transform((editor) => {
      for (const command of commands) {
        editor.add(command)
      }
    }),
  )
  await ctx.command.reload()

  registrations.push(
    await ctx.mcp.transform((editor) => {
      for (const [name, config] of mcpServers) {
        editor.set(name, config)
      }
    }),
  )
  await ctx.mcp.reload()

  return async () => {
    for (const registration of registrations.reverse()) {
      await registration.dispose();
    }
  };
}

/**
 * The `mcpServers` slice of the component bundle is populated from the V2 MCP
 * registry so the agent-config merge point sees the same server set the V2
 * editor will be handed, instead of a permanently empty placeholder.
 */
function componentBundle(mcpServers: Map<string, V2McpServerConfig>): PluginComponents {
  return {
    commands: {},
    skills: {},
    agents: {},
    mcpServers: Object.fromEntries(mcpServers),
    hooksConfigs: [],
    plugins: [],
    errors: [],
  };
}

type ResolvedComponents = {
  skills: V2SkillInfo[];
  commands: V2CommandDefinition[];
  mcpServers: Map<string, V2McpServerConfig>;
  agents: Map<string, ReturnType<typeof toV2AgentFields>>;
  defaultAgent?: string;
};

async function resolveComponents(
  ctx: V2ComponentRegistrar,
  deps: V2ComponentDeps,
): Promise<ResolvedComponents> {
  const pluginConfig = deps.pluginConfig;
  if (deps.availableToolNames) setAvailableToolNames(deps.availableToolNames);
  const mcpServers = resolveV2McpServers(pluginConfig);
  const config: Record<string, unknown> = {};
  const agentResult = await applyAgentConfig({
    config,
    pluginConfig,
    ctx: { directory: deps.directory, client: deps.client },
    pluginComponents: componentBundle(mcpServers),
  });

  const agents = new Map<string, ReturnType<typeof toV2AgentFields>>(
    Object.entries(agentResult).map(([id, record]) => [
      id,
      toV2AgentFields((record ?? {}) as Record<string, unknown>),
    ]),
  );

  const disabledSkills = new Set<string>(pluginConfig.disabled_skills ?? []);
  if (!pluginConfig.tdd_enforcer?.enabled) disabledSkills.add("tdd-enforcer");

  const skills = createBuiltinSkills({
    browserProvider: pluginConfig.browser_automation_engine?.provider ?? "playwright",
    disabledSkills,
  }).map((skill) =>
    toV2SkillInfo(
      skill,
      join(deps.directory, BUILTIN_SKILL_SOURCE_DIR, skill.name, "SKILL.md"),
    ),
  );

  const commands = Object.values(
    loadBuiltinCommands(pluginConfig.disabled_commands),
  ).map((definition) =>
    toV2CommandDefinition(definition, (sessionID, text, delivery) =>
      ctx.session
        .prompt({ sessionID, text, delivery })
        .then(() => undefined),
    ),
  );

  const defaultAgent = typeof config.default_agent === "string" ? config.default_agent : undefined;

  log("[registerV2Components] components resolved", {
    agentCount: agents.size,
    skillCount: skills.length,
    commandCount: commands.length,
    mcpCount: mcpServers.size,
  });

  return { skills, commands, mcpServers, agents, defaultAgent };
}
