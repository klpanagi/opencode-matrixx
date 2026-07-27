import type { BuiltinSkill } from "../../features/builtin-skills"
import type { CommandInfo } from "./types"

export function skillToCommandInfo(skill: BuiltinSkill): CommandInfo {
  return {
    name: skill.name,
    metadata: {
      name: skill.name,
      description: skill.description || "",
      argumentHint: skill.argumentHint,
      model: skill.model,
      agent: skill.agent,
      subtask: skill.subtask,
    },
    content: skill.template,
    scope: "builtin",
  }
}
