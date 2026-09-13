import * as p from "@clack/prompts"
import { BuiltinAgentNameSchema } from "../../config/schema/agent-names"
import { BuiltinCategoryNameSchema } from "../../config/schema/categories"
import type { ModelPreset, ModelPresetEntry } from "../../config/schema/model-presets"
import { readConnectedProvidersCache } from "../../shared/connected-providers-cache"
import { fetchAvailableModels } from "../../shared/model-availability"

/**
 * Exact error surfaced when no connected provider / model can be detected.
 * Aborts setup before any config is written.
 */
export const NO_CONNECTED_PROVIDERS_ERROR =
  "No connected providers detected. Configure at least one provider in OpenCode (opencode auth login), then re-run: bunx opencode-matrixx setup"

export type PresetWizardResult =
  | { status: "generated"; name: string; preset: ModelPreset }
  | { status: "skipped" }
  | { status: "no-providers"; error: string }

/**
 * Build a preset that assigns the same model to every builtin agent and
 * category (pure — no prompts, no I/O). The explicit per-entry assignments
 * make the generated preset self-documenting and individually overridable.
 */
export function buildDefaultPreset(
  model: string,
  agentNames: readonly string[],
  categoryNames: readonly string[],
): ModelPreset {
  // Fresh object per entry — sharing one reference would alias all agents
  // together on any later mutation of the generated preset.
  return {
    default_model: model,
    agents: Object.fromEntries(agentNames.map((name) => [name, { model }])),
    categories: Object.fromEntries(categoryNames.map((name) => [name, { model }])),
  }
}

/**
 * Detect the models available from connected providers using the shared
 * provider caches (no OpenCode client calls — safe during CLI execution).
 */
export async function detectAvailableModels(): Promise<Set<string>> {
  const connected = readConnectedProvidersCache()
  return fetchAvailableModels(undefined, {
    connectedProviders: connected && connected.length > 0 ? connected : undefined,
  })
}

/**
 * First-run preset step: detect connected providers, prompt for a preset
 * name + default model, and return the generated preset. Returns
 * `no-providers` (with the exact error) when nothing is detected, and
 * `skipped` when the user declines or `--skip-presets` is set.
 */
export async function runPresetWizard(opts: { skip: boolean }): Promise<PresetWizardResult> {
  if (opts.skip) return { status: "skipped" }

  const models = await detectAvailableModels()
  if (models.size === 0) {
    return { status: "no-providers", error: NO_CONNECTED_PROVIDERS_ERROR }
  }

  const generate = await p.confirm({
    message: "Generate a default model preset from your connected providers?",
    initialValue: true,
  })
  if (p.isCancel(generate)) {
    p.cancel("Cancelled")
    process.exit(130)
  }
  if (!generate) return { status: "skipped" }

  const nameAns = await p.text({
    message: "Preset name?",
    initialValue: "default",
  })
  if (p.isCancel(nameAns)) {
    p.cancel("Cancelled")
    process.exit(130)
  }
  const name = (nameAns as string).trim() || "default"

  const modelOptions = [...models].sort().map((model) => ({ value: model, label: model }))
  const modelAns = await p.select({
    message: "Default model for all agents and categories?",
    options: modelOptions,
    initialValue: modelOptions[0]?.value,
  })
  if (p.isCancel(modelAns)) {
    p.cancel("Cancelled")
    process.exit(130)
  }

  const preset = buildDefaultPreset(
    modelAns as string,
    BuiltinAgentNameSchema.options,
    BuiltinCategoryNameSchema.options,
  )
  return { status: "generated", name, preset }
}