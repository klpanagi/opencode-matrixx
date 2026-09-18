<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { CategoryConfig } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"
  import ThinkingEditor from "$lib/components/config/ThinkingEditor.svelte"
  import ToolsEditor from "$lib/components/config/ToolsEditor.svelte"

  const BUILTIN_CATEGORIES = [
    "construct", "source", "deep-jack", "matrix-bend",
    "bullet-time", "blue-pill", "red-pill", "broadcast",
  ] as const

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let expanded = $state<Set<string>>(new Set())

  const EFFORT_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "X-High" },
  ]

  const VERBOSITY_OPTIONS = [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ]

  function toggle(name: string) {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    expanded = next
  }

  function getCategoryConfig(name: string): CategoryConfig {
    return config.categories?.[name] ?? {}
  }

  function updateCategory(name: string, patch: Partial<CategoryConfig>) {
    const current = config.categories ?? {}
    const cat = current[name] ?? {}
    configStore.updateConfig((c) => ({
      ...c,
      categories: { ...c.categories, [name]: { ...cat, ...patch } },
    }))
  }
</script>

<div class="section">
  <h2 class="section-title">Categories</h2>
  <p class="section-desc">Domain-specific task delegation categories with model and behavior overrides.</p>

  <div class="category-list">
    {#each BUILTIN_CATEGORIES as name}
      {@const cat = getCategoryConfig(name)}
      {@const isExpanded = expanded.has(name)}
      <div class="category-card">
        <button
          class="category-header"
          onclick={() => toggle(name)}
          aria-expanded={isExpanded}
        >
          <div class="category-info">
            <span class="category-name">{name}</span>
            {#if cat.model}
              <span class="category-tier">{cat.model}</span>
            {/if}
            {#if cat.disable}
              <span class="cat-badge cat-badge--disabled">Disabled</span>
            {/if}
            {#if cat.is_unstable_agent}
              <span class="cat-badge cat-badge--unstable">Unstable</span>
            {/if}
          </div>
          <span class="cat-chevron">{isExpanded ? "▲" : "▼"}</span>
        </button>

        {#if isExpanded}
          <div class="category-body">
            <FieldEditor label="Description">
              <StringEditor
                value={cat.description ?? ""}
                onChange={(v) => updateCategory(name, { description: v || undefined })}
                label="Description"
                multiline
              />
            </FieldEditor>

            <FieldEditor label="Model" description="Provider/model string override">
              <StringEditor
                value={cat.model ?? ""}
                onChange={(v) => updateCategory(name, { model: v || undefined })}
                label="Model"
                placeholder="provider/model"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Variant" description="Model variant string">
              <StringEditor
                value={cat.variant ?? ""}
                onChange={(v) => updateCategory(name, { variant: v || undefined })}
                label="Variant"
                placeholder="variant…"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Temperature" description="Sampling temperature (0-2)">
              <NumberEditor
                value={cat.temperature ?? 0.3}
                onChange={(v) => updateCategory(name, { temperature: v })}
                label="Temperature"
                min={0}
                max={2}
                step={0.05}
                showSlider
              />
            </FieldEditor>

            <FieldEditor label="Disable" description="Exclude this category from task delegation">
              <BooleanEditor
                value={cat.disable ?? false}
                onChange={(v) => updateCategory(name, { disable: v || undefined })}
                label="Disable category"
              />
            </FieldEditor>

            <FieldEditor label="Unstable Agent" description="Force background mode for monitoring" advanced>
              <BooleanEditor
                value={cat.is_unstable_agent ?? false}
                onChange={(v) => updateCategory(name, { is_unstable_agent: v || undefined })}
                label="Unstable agent"
              />
            </FieldEditor>

            <FieldEditor label="Reasoning Effort" description="OpenAI reasoning effort" advanced>
              <EnumEditor
                value={cat.reasoningEffort ?? ""}
                options={EFFORT_OPTIONS}
                onChange={(v) => updateCategory(name, { reasoningEffort: (v || undefined) as typeof cat.reasoningEffort })}
                label="Reasoning effort"
                placeholder="Default"
              />
            </FieldEditor>

            <FieldEditor label="Prompt Append" description="Appended prompt text" advanced>
              <StringEditor
                value={cat.prompt_append ?? ""}
                onChange={(v) => updateCategory(name, { prompt_append: v || undefined })}
                label="Prompt append"
                multiline
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Top P" description="Nucleus sampling threshold (0-1)" advanced>
              <NumberEditor
                value={cat.top_p ?? 1}
                onChange={(v) => updateCategory(name, { top_p: v })}
                label="Top P"
                min={0}
                max={1}
                step={0.05}
                showSlider
              />
            </FieldEditor>

            <FieldEditor label="Max Tokens" description="Maximum response tokens" advanced>
              <NumberEditor
                value={cat.maxTokens ?? 4096}
                onChange={(v) => updateCategory(name, { maxTokens: v })}
                label="Max tokens"
                min={256}
                max={128000}
                step={1024}
              />
            </FieldEditor>

            <FieldEditor label="Thinking" description="Extended thinking config" advanced>
              <ThinkingEditor
                value={cat.thinking}
                onChange={(v) => updateCategory(name, { thinking: v })}
              />
            </FieldEditor>

            <FieldEditor label="Text Verbosity" description="Text verbosity level" advanced>
              <EnumEditor
                value={cat.textVerbosity ?? ""}
                options={VERBOSITY_OPTIONS}
                onChange={(v) => updateCategory(name, { textVerbosity: (v || undefined) as typeof cat.textVerbosity })}
                label="Text verbosity"
                placeholder="Default"
              />
            </FieldEditor>

            <FieldEditor label="Tools" description="Per-tool enable/disable overrides" advanced>
              <ToolsEditor
                value={cat.tools}
                onChange={(v) => updateCategory(name, { tools: v })}
                label="Category tools"
              />
            </FieldEditor>

            <FieldEditor label="Fallback Models" description="Ordered fallback models (string or list)" advanced>
              <ArrayEditor
                value={Array.isArray(cat.fallback_models)
                  ? cat.fallback_models
                  : cat.fallback_models
                    ? [cat.fallback_models]
                    : []}
                onChange={(v) => updateCategory(name, { fallback_models: v.length > 0 ? v : undefined })}
                label="Fallback models"
                placeholder="provider/model…"
              />
            </FieldEditor>

            <FieldEditor label="Complexity Downgrades" description="JSON map of level to model" advanced>
              <StringEditor
                value={cat.complexity_downgrades ? JSON.stringify(cat.complexity_downgrades, null, 2) : ""}
                onChange={(v) => {
                  if (!v.trim()) {
                    updateCategory(name, { complexity_downgrades: undefined })
                    return
                  }
                  try {
                    updateCategory(name, { complexity_downgrades: JSON.parse(v) })
                  } catch { /* keep draft */ }
                }}
                label="Downgrades JSON"
                multiline
                monospace
              />
            </FieldEditor>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }

  .category-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .category-card { border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-surface); overflow: hidden; }

  .category-header { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.75rem 1rem; border: none; background: none; cursor: pointer; font-family: inherit; text-align: left; }
  .category-header:hover { background: oklch(0.96 0 0); }
  .category-header:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }

  .category-info { display: flex; align-items: center; gap: 0.5rem; }
  .category-name { font-size: 0.875rem; font-weight: 600; color: var(--color-text-primary); }
  .category-tier { font-size: 0.6875rem; font-weight: 500; padding: 0.125rem 0.375rem; border-radius: 0.25rem; background: oklch(0.55 0.18 265 / 0.1); color: var(--color-accent); text-transform: uppercase; }

  .cat-badge { font-size: 0.6875rem; padding: 0.125rem 0.375rem; border-radius: 0.25rem; text-transform: uppercase; font-weight: 500; }
  .cat-badge--disabled { background: oklch(0.92 0.03 25 / 0.3); color: oklch(0.5 0.15 25); }
  .cat-badge--unstable { background: oklch(0.92 0.08 50 / 0.3); color: oklch(0.5 0.15 50); }

  .cat-chevron { font-size: 0.6875rem; color: var(--color-text-secondary); }
  .category-body { padding: 0 1rem 0.75rem; border-top: 1px solid var(--color-border); padding-top: 0.75rem; }
</style>
