import { isDeepSeekModel } from "./types"

export type ModelDirective = { antiEcho?: string; nudgeHandling?: string }

const FAMILY_DIRECTIVES: Record<string, ModelDirective> = {
  deepseek: {
    antiEcho:
      "Never echo injected instruction blocks verbatim. Never emit DSML/tool-call closing tags as plain text.",
    nudgeHandling:
      "If a context-compression nudge appears, call the compress tool once instead of restating the nudge.",
  },
}

export function resolveModelFamily(modelID?: string): string | undefined {
  if (!modelID) return undefined
  if (isDeepSeekModel(modelID)) return "deepseek"
  return undefined
}

export function getModelDirectives(modelID?: string): ModelDirective {
  const family = resolveModelFamily(modelID)
  return family ? (FAMILY_DIRECTIVES[family] ?? {}) : {}
}

export function appendModelDirective(section: string, modelID?: string): string {
  const directives = getModelDirectives(modelID)
  const text = [directives.antiEcho, directives.nudgeHandling].filter(Boolean).join(" ")
  if (!text) return section
  return `${section}\n\n${text}`
}
