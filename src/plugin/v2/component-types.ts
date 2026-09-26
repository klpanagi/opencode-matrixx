import type { V2PluginContext } from "../types"

type AgentDomain = V2PluginContext["agent"]
type SkillDomain = V2PluginContext["skill"]
type CommandDomain = V2PluginContext["command"]
type McpDomain = V2PluginContext["mcp"]
type SessionDomain = V2PluginContext["session"]

export type V2AgentEditor = Parameters<Parameters<AgentDomain["transform"]>[0]>[0]
export type V2SkillEditor = Parameters<Parameters<SkillDomain["transform"]>[0]>[0]
export type V2CommandEditor = Parameters<Parameters<CommandDomain["transform"]>[0]>[0]
export type V2McpEditor = Parameters<Parameters<McpDomain["transform"]>[0]>[0]

export type V2SkillInfo = Parameters<V2SkillEditor["add"]>[0]
export type V2CommandDefinition = Parameters<V2CommandEditor["add"]>[0]
export type V2McpServerConfig = Parameters<V2McpEditor["set"]>[1]
export type V2CommandInvocation = Parameters<V2CommandDefinition["execute"]>[0]

export type V2ComponentRegistration = Awaited<ReturnType<AgentDomain["transform"]>>

/**
 * The subset of the V2 plugin context the component registrar touches. A real
 * `Context` satisfies it structurally, and so does a test fake that implements
 * only `agent`/`skill`/`command`/`mcp.transform` + `reload` and
 * `session.prompt`.
 */
export type V2ComponentRegistrar = {
  agent: {
    transform: AgentDomain["transform"];
    reload: AgentDomain["reload"];
  };
  skill: {
    transform: SkillDomain["transform"];
    reload: SkillDomain["reload"];
  };
  command: {
    transform: CommandDomain["transform"];
    reload: CommandDomain["reload"];
  };
  mcp: {
    transform: McpDomain["transform"];
    reload: McpDomain["reload"];
  };
  session: {
    prompt: SessionDomain["prompt"];
  };
}
