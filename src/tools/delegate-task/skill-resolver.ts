import type { BrowserAutomationProvider } from "../../config/schema"
import { createBuiltinSkills } from "../../features/builtin-skills"

export function resolveSkillContent(
  skills: string[],
  options: { browserProvider?: BrowserAutomationProvider, disabledSkills?: Set<string> }
): { content: string | undefined; error: string | null } {
  if (skills.length === 0) {
    return { content: undefined, error: null }
  }

  const builtinSkills = createBuiltinSkills({ browserProvider: options.browserProvider, disabledSkills: options.disabledSkills })
  const resolved = builtinSkills.filter(s => skills.includes(s.name))
  const resolvedNames = new Set(resolved.map(s => s.name))
  const notFound = skills.filter(name => !resolvedNames.has(name))

  if (notFound.length > 0) {
    const available = builtinSkills.map(s => s.name).join(", ")
    return { content: undefined, error: `Skills not found: ${notFound.join(", ")}. Available: ${available}` }
  }

  return { content: resolved.map(s => s.template).join("\n\n"), error: null }
}
