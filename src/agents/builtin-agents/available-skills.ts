import type { BrowserAutomationProvider } from "../../config/schema"
import { type BuiltinSkill, createBuiltinSkills } from "../../features/builtin-skills"
import type { AvailableSkill } from "../dynamic-agent-prompt-builder"

export function buildAvailableSkills(
  discoveredSkills: BuiltinSkill[],
  browserProvider?: BrowserAutomationProvider,
  disabledSkills?: Set<string>,
  currentAgent?: string
): AvailableSkill[] {
  const builtinSkills = createBuiltinSkills({ browserProvider, disabledSkills })
  const builtinSkillNames = new Set(builtinSkills.map(s => s.name))

  const builtinAvailable: AvailableSkill[] = builtinSkills
    .filter((skill) => {
      if (skill.agent && currentAgent && skill.agent !== currentAgent) return false
      return true
    })
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      location: "plugin" as const,
    }))

  const discoveredAvailable: AvailableSkill[] = discoveredSkills
    .filter((s) => {
      if (!builtinSkillNames.has(s.name) && !disabledSkills?.has(s.name)) {
        if (s.agent && currentAgent && s.agent !== currentAgent) return false
        return true
      }
      return false
    })
    .map((skill) => ({
      name: skill.name,
      description: skill.description || "",
      location: "plugin" as const,
    }))

  return [...builtinAvailable, ...discoveredAvailable]
}
