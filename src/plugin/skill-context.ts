import type { AvailableSkill } from "../agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "../config"
import type { BrowserAutomationProvider } from "../config/schema/browser-automation"
import { type BuiltinSkill, createBuiltinSkills } from "../features/builtin-skills"

export type SkillContext = {
  builtinSkills: BuiltinSkill[]
  availableSkills: AvailableSkill[]
  browserProvider: BrowserAutomationProvider
  disabledSkills: Set<string>
}

export async function createSkillContext(args: {
  directory: string
  pluginConfig: MatrixxConfig
}): Promise<SkillContext> {
  const { pluginConfig } = args

  const browserProvider: BrowserAutomationProvider =
    pluginConfig.browser_automation_engine?.provider ?? "playwright"

  const disabledSkills = new Set<string>(pluginConfig.disabled_skills ?? [])
  if (!pluginConfig.tdd_enforcer?.enabled) {
    disabledSkills.add("tdd-enforcer")
  }

  const builtinSkills = createBuiltinSkills({
    browserProvider,
    disabledSkills,
  })

  const availableSkills: AvailableSkill[] = builtinSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: "plugin",
  }))

  return {
    builtinSkills,
    availableSkills,
    browserProvider,
    disabledSkills,
  }
}
