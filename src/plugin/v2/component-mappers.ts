import type { BuiltinSkill } from "../../features/builtin-skills"
import type { CommandDefinition } from "../../features/command-definitions"
import type {
  V2CommandDefinition,
  V2CommandInvocation,
  V2SkillInfo,
} from "./component-types"

export type V2PromptDeliverer = (
  sessionID: string,
  text: string,
  delivery: V2CommandInvocation["delivery"],
) => Promise<void>;

function brand<T extends string>(value: string): T {
  return value as T;
}

export function toV2SkillInfo(skill: BuiltinSkill, sourcePath: string): V2SkillInfo {
  return {
    id: brand<V2SkillInfo["id"]>(skill.name),
    name: brand<V2SkillInfo["name"]>(skill.name),
    description: skill.description,
    content: skill.template,
    path: brand<V2SkillInfo["path"]>(sourcePath),
  };
}

export function renderCommandTemplate(template: string, args: string): string {
  return template.replaceAll("$ARGUMENTS", args);
}

export function toV2CommandDefinition(
  definition: CommandDefinition,
  deliver: V2PromptDeliverer,
): V2CommandDefinition {
  return {
    name: definition.name,
    description: definition.description,
    execute: async ({ sessionID, prompt, delivery }) => {
      const text = renderCommandTemplate(definition.template, promptText(prompt));
      await deliver(sessionID, text, delivery);
    },
  };
}

function promptText(prompt: unknown): string {
  if (typeof prompt === "string") return prompt;
  if (typeof prompt !== "object" || prompt === null) return "";
  const text = (prompt as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

export type V2AgentFields = {
  description?: string;
  system?: string;
  mode?: "subagent" | "primary" | "all";
  hidden?: boolean;
  color?: string;
};

/**
 * V1 agent records use `prompt` for the system prompt and leave `mode`
 * optional; V2 `Agent.Info` names the same field `system` and requires `mode`.
 */
export function toV2AgentFields(record: Record<string, unknown>): V2AgentFields {
  const fields: V2AgentFields = {};
  if (typeof record.description === "string") fields.description = record.description;
  if (typeof record.prompt === "string") fields.system = record.prompt;
  if (record.mode === "subagent" || record.mode === "primary" || record.mode === "all") {
    fields.mode = record.mode;
  }
  if (typeof record.hidden === "boolean") fields.hidden = record.hidden;
  if (typeof record.color === "string") fields.color = record.color;
  return fields;
}
