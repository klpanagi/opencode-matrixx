import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import type { MatrixxConfig } from "../../config"
import type { ModelPreset } from "../../config/schema/model-presets"
import { getSessionPreset, setSessionPreset } from "../../features/preset-state"
import { parseJsoncSafe } from "../../shared/jsonc-parser"
import { log } from "../../shared/logger"

const ACTIONS = ["list", "show", "set"] as const
const SCOPES = ["global", "project"] as const

export interface PresetToolOptions {
  pluginConfig?: MatrixxConfig
  directory?: string
}

/**
 * Resolve the config file path for a persistence scope.
 * Project scope targets `.opencode/matrixx.jsonc`; global scope targets
 * `~/.config/opencode/matrixx.jsonc` (mirrors the dcp-switch-profile path
 * resolution for the user config dir).
 */
function resolveConfigPath(scope: "global" | "project", directory?: string): string {
  if (scope === "global") {
    return join(homedir(), ".config", "opencode", "matrixx.jsonc")
  }
  return join(directory ?? process.cwd(), ".opencode", "matrixx.jsonc")
}

/**
 * Persist `active_preset` into the target config file. Existing files are
 * parsed with the JSONC parser (comments + trailing commas preserved via
 * re-serialization) and merged; missing files are created with the key only.
 */
function persistActivePreset(
  presetName: string,
  scope: "global" | "project",
  directory?: string,
): { ok: true; path: string } | { ok: false; error: string } {
  const configPath = resolveConfigPath(scope, directory)

  let raw: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8")
    const parsed = parseJsoncSafe<Record<string, unknown>>(content)
    if (parsed.errors.length > 0) {
      return {
        ok: false,
        error: `Cannot parse existing config at ${configPath}: ${parsed.errors[0]?.message}`,
      }
    }
    raw = parsed.data ?? {}
  } else {
    mkdirSync(dirname(configPath), { recursive: true })
  }

  raw.active_preset = presetName
  writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`)
  log("[preset] persisted active_preset", { presetName, scope, configPath })
  return { ok: true, path: configPath }
}

function unknownPresetError(name: string, presetNames: string[]): string {
  const available = presetNames.length > 0 ? presetNames.join(", ") : "(none defined)"
  return `Error: Unknown preset "${name}". Available presets: ${available}`
}

function formatPreset(name: string, preset: ModelPreset): string {
  const lines = [`Preset "${name}":`]
  if (preset.default_model) {
    lines.push(`  default_model: ${preset.default_model}`)
  }
  const agentEntries = Object.entries(preset.agents ?? {})
  if (agentEntries.length > 0) {
    lines.push("  agents:")
    for (const [agent, entry] of agentEntries) {
      lines.push(`    - ${agent}: ${entry.model}${entry.variant ? ` (variant: ${entry.variant})` : ""}`)
    }
  }
  const categoryEntries = Object.entries(preset.categories ?? {})
  if (categoryEntries.length > 0) {
    lines.push("  categories:")
    for (const [category, entry] of categoryEntries) {
      lines.push(`    - ${category}: ${entry.model}${entry.variant ? ` (variant: ${entry.variant})` : ""}`)
    }
  }
  return lines.join("\n")
}

function runPresetCommand(input: {
  action: string
  name?: string
  save?: boolean
  scope: "global" | "project"
  sessionID: string
  options?: PresetToolOptions
}): string {
  const { action, name, save, scope, sessionID, options } = input
  const presets = options?.pluginConfig?.model_presets ?? {}
  const presetNames = Object.keys(presets)
  const activePreset = options?.pluginConfig?.active_preset
  const sessionPreset = getSessionPreset(sessionID)
  const effective = sessionPreset ?? activePreset

  if (action === "list") {
    if (presetNames.length === 0) {
      return "No model presets defined. Add a `model_presets` section to your matrixx config."
    }
    const lines = presetNames.map((p) => `- ${p}${p === effective ? " (active)" : ""}`)
    const activeLine = effective
      ? `Active: ${effective}${sessionPreset ? ` (session overlay for ${sessionID})` : ""}`
      : "Active: (none)"
    return `Available presets:\n${lines.join("\n")}\n\n${activeLine}`
  }

  if (action === "show") {
    const target = name ?? effective
    if (!target) {
      return "No preset specified and no active preset set. Usage: preset show <name>"
    }
    const preset = presets[target]
    if (!preset) return unknownPresetError(target, presetNames)
    return formatPreset(target, preset)
  }

  // action === "set"
  if (!name) {
    return "Error: `preset set` requires a preset name. Usage: preset set <name> [--save [--global|--project]]"
  }
  if (!presets[name]) return unknownPresetError(name, presetNames)

  setSessionPreset(sessionID, name)
  let message =
    `✓ Active preset set to "${name}" for this session.\n\n` +
    `- delegate-task categories switch immediately\n` +
    `- builtin agents apply on next session`

  if (save) {
    const result = persistActivePreset(name, scope, options?.directory)
    if (!result.ok) return `Error: ${result.error}`
    message += `\n\nPersisted active_preset to ${result.path} (scope: ${scope}). Next session starts on "${name}".`
  }
  return message
}

export function createPresetTool(options?: PresetToolOptions): Record<string, ToolDefinition> {
  const preset: ToolDefinition = tool({
    description:
      "Manage model presets: list available presets, show a preset's model assignments, " +
      "or set the active preset for the current session. `set <name>` switches delegate-task " +
      "categories immediately and applies to builtin agents on the next session; " +
      "`set <name> --save [--global|--project]` additionally persists `active_preset` to config.",
    args: {
      action: tool.schema
        .enum(ACTIONS)
        .describe("Operation: list available presets, show a preset's details, or set the active preset"),
      name: tool.schema
        .string()
        .optional()
        .describe("Preset name (required for set; optional for show — defaults to the active preset)"),
      save: tool.schema
        .boolean()
        .optional()
        .describe("Persist the active preset to config (default: false — session-only overlay)"),
      scope: tool.schema
        .enum(SCOPES)
        .optional()
        .describe(
          "Where to persist when --save: project (.opencode/matrixx.jsonc, default) or global (~/.config/opencode/matrixx.jsonc)",
        ),
    },
    async execute(args, context) {
      const action = args.action as string
      const name = args.name as string | undefined
      const save = args.save as boolean | undefined
      const scope = (args.scope as "global" | "project" | undefined) ?? "project"
      return runPresetCommand({ action, name, save, scope, sessionID: context.sessionID, options })
    },
  })

  return { preset }
}