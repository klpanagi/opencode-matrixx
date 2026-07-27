import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import { type BuiltinSkill, createBuiltinSkills } from "../../features/builtin-skills"
import { TOOL_DESCRIPTION_NO_SKILLS, TOOL_DESCRIPTION_PREFIX } from "./constants"
import type { SkillArgs, SkillInfo, SkillLoadOptions } from "./types"

function loadedSkillToInfo(skill: BuiltinSkill): SkillInfo {
  return {
    name: skill.name,
    description: skill.description || "",
    location: undefined,
    license: skill.license,
    compatibility: skill.compatibility,
    metadata: skill.metadata as Record<string, string> | undefined,
    allowedTools: skill.allowedTools,
  }
}

function formatSkillsXml(skills: SkillInfo[]): string {
  if (skills.length === 0) return ""

  const skillsXml = skills.map(skill => {
    const lines = [
      "  <skill>",
      `    <name>${skill.name}</name>`,
      `    <description>${skill.description}</description>`,
    ]
    if (skill.compatibility) {
      lines.push(`    <compatibility>${skill.compatibility}</compatibility>`)
    }
    lines.push("  </skill>")
    return lines.join("\n")
  }).join("\n")

  return `\n\n<available_skills>\n${skillsXml}\n</available_skills>`
}

export function createSkillTool(options: SkillLoadOptions = {}): ToolDefinition {
  let cachedSkills: BuiltinSkill[] | null = null
  let cachedDescription: string | null = null

  const getSkills = (): BuiltinSkill[] => {
    if (options.skills) return options.skills
    if (cachedSkills) return cachedSkills
    cachedSkills = createBuiltinSkills({ disabledSkills: options?.disabledSkills })
    return cachedSkills
  }

  const getDescription = (): string => {
    if (cachedDescription) return cachedDescription
    const skills = getSkills()
    const skillInfos = skills.map(loadedSkillToInfo)
    cachedDescription = skillInfos.length === 0
      ? TOOL_DESCRIPTION_NO_SKILLS
      : TOOL_DESCRIPTION_PREFIX + formatSkillsXml(skillInfos)
    return cachedDescription
  }

  if (options.skills) {
    const skillInfos = options.skills.map(loadedSkillToInfo)
    cachedDescription = skillInfos.length === 0
      ? TOOL_DESCRIPTION_NO_SKILLS
      : TOOL_DESCRIPTION_PREFIX + formatSkillsXml(skillInfos)
  } else {
    getDescription()
  }

  return tool({
    get description() {
      return cachedDescription ?? TOOL_DESCRIPTION_PREFIX
    },
    args: {
      name: tool.schema.string().describe("The skill identifier from available_skills (e.g., 'code-review')"),
    },
    async execute(args: SkillArgs, ctx?: { agent?: string }) {
      const skills = getSkills()
      const skill = skills.find(s => s.name === args.name)

      if (!skill) {
        const available = skills.map(s => s.name).join(", ")
        throw new Error(`Skill "${args.name}" not found. Available skills: ${available || "none"}`)
      }

      if (skill.agent && (!ctx?.agent || skill.agent !== ctx.agent)) {
        throw new Error(`Skill "${args.name}" is restricted to agent "${skill.agent}"`)
      }

      const body = skill.template
      const dir = process.cwd()

      const output = [
        `## Skill: ${skill.name}`,
        "",
        `**Base directory**: ${dir}`,
        "",
        body,
      ]

      return output.join("\n")
    },
  })
}

export const skill: ToolDefinition = createSkillTool()
