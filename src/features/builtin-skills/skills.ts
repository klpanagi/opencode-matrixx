import type { BuiltinSkill } from "./types"
import type { BrowserAutomationProvider } from "../../config/schema"

import {
  playwrightSkill,
  agentBrowserSkill,
  frontendUiUxSkill,
  gitMasterSkill,
  devBrowserSkill,
  dslExpertSkill,
} from "./skills/index"

export interface CreateBuiltinSkillsOptions {
  browserProvider?: BrowserAutomationProvider
  disabledSkills?: Set<string>
}

export function createBuiltinSkills(options: CreateBuiltinSkillsOptions = {}): BuiltinSkill[] {
  const { browserProvider = "playwright", disabledSkills } = options

  const browserSkill = browserProvider === "agent-browser" ? agentBrowserSkill : playwrightSkill

  const skills = [browserSkill, frontendUiUxSkill, gitMasterSkill, devBrowserSkill, dslExpertSkill]

  if (!disabledSkills) {
    return skills
  }

  return skills.filter((skill) => !disabledSkills.has(skill.name))
}
