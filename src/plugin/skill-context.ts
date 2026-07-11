import type { AvailableSkill } from "../agents/dynamic-agent-prompt-builder"
import type { MatrixxConfig } from "../config"
import type { BrowserAutomationProvider } from "../config/schema/browser-automation"
import { createBuiltinSkills } from "../features/builtin-skills"
import {
  discoverConfigSourceSkills,
  discoverGlobalAgentsSkills,
  discoverOpencodeGlobalSkills,
  discoverOpencodeProjectSkills,
  discoverProjectAgentsSkills,
  mergeSkills,
} from "../features/opencode-skill-loader"
import type {
  LoadedSkill,
  SkillScope,
} from "../features/opencode-skill-loader/types"

export type SkillContext = {
  mergedSkills: LoadedSkill[]
  availableSkills: AvailableSkill[]
  browserProvider: BrowserAutomationProvider
  disabledSkills: Set<string>
}

function mapScopeToLocation(scope: SkillScope): AvailableSkill["location"] {
  if (scope === "user" || scope === "opencode") return "user"
  if (scope === "project" || scope === "opencode-project") return "project"
  return "plugin"
}

export async function createSkillContext(args: {
  directory: string
  pluginConfig: MatrixxConfig
}): Promise<SkillContext> {
  const { directory, pluginConfig } = args

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

  const [configSourceSkills, userSkills, globalSkills, projectSkills, opencodeProjectSkills, agentsProjectSkills, agentsGlobalSkills] =
    await Promise.all([
      discoverConfigSourceSkills({
        config: pluginConfig.skills,
        configDir: directory,
      }),
      Promise.resolve([]),
      discoverOpencodeGlobalSkills(),
      Promise.resolve([]),
      discoverOpencodeProjectSkills(directory),
      discoverProjectAgentsSkills(directory),
      discoverGlobalAgentsSkills(),
    ])

  const mergedSkills = mergeSkills(
    builtinSkills,
    pluginConfig.skills,
    configSourceSkills,
    [...userSkills, ...agentsGlobalSkills],
    globalSkills,
    [...projectSkills, ...agentsProjectSkills],
    opencodeProjectSkills,
    { configDir: directory },
  )

  const availableSkills: AvailableSkill[] = mergedSkills.map((skill) => ({
    name: skill.name,
    description: skill.definition.description ?? "",
    location: mapScopeToLocation(skill.scope),
  }))

  return {
    mergedSkills,
    availableSkills,
    browserProvider,
    disabledSkills,
  }
}
