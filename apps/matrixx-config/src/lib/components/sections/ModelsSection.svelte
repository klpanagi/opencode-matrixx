<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { ModelPreset } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let expanded = $state<Set<string>>(new Set(["default"]))
  let newPreset = $state("")

  function toggle(n: string) {
    const next = new Set(expanded)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    expanded = next
  }

  function presets(): Record<string, ModelPreset> {
    return config.model_presets ?? {}
  }

  function setPresets(p: Record<string, ModelPreset> | undefined) {
    configStore.updateConfig((c) => ({
      ...c,
      model_presets: p && Object.keys(p).length > 0 ? p : undefined,
    }))
  }

  function addPreset() {
    const n = newPreset.trim()
    if (!n || presets()[n]) return
    setPresets({ ...presets(), [n]: {} })
    newPreset = ""
    const next = new Set(expanded)
    next.add(n)
    expanded = next
  }

  function removePreset(n: string) {
    const next = { ...presets() }
    delete next[n]
    setPresets(next)
  }

  function updatePreset(n: string, patch: Partial<ModelPreset>) {
    setPresets({ ...presets(), [n]: { ...presets()[n], ...patch } })
  }

  function entryList(m: Record<string, { model: string; variant?: string }> | undefined): string[] {
    return Object.entries(m ?? {}).map(([k, v]) =>
      v.variant ? `${k}=${v.model} (${v.variant})` : `${k}=${v.model}`,
    )
  }

  function parseEntries(list: string[]): Record<string, { model: string; variant?: string }> {
    const out: Record<string, { model: string; variant?: string }> = {}
    for (const item of list) {
      const eq = item.indexOf("=")
      if (eq < 0) continue
      const key = item.slice(0, eq).trim()
      let rest = item.slice(eq + 1).trim()
      if (!key || !rest) continue
      const m = rest.match(/^(.*)\s+\(([^)]+)\)\s*$/)
      if (m) out[key] = { model: (m[1] ?? "").trim(), variant: (m[2] ?? "").trim() }
      else out[key] = { model: rest }
    }
    return out
  }

  function jsonText(v: unknown): string {
    if (v === undefined) return ""
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return ""
    }
  }

  function parseJson(text: string): unknown | undefined {
    const t = text.trim()
    if (!t) return undefined
    try {
      return JSON.parse(t)
    } catch {
      return undefined
    }
  }
</script>

<div class="section">
  <h2 class="section-title">Models & Presets</h2>
  <p class="section-desc">Named provider/model bundles, active preset, and config-driven requirements.</p>

  <FieldEditor label="Active Preset" description="Name of the active entry in model_presets">
    <StringEditor
      value={config.active_preset ?? ""}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, active_preset: v || undefined }))}
      label="Active preset"
      placeholder="Preset name…"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Model Presets" description="Static bundles: default_model plus per-agent and per-category models">
    <div class="preset-add">
      <StringEditor
        value={newPreset}
        onChange={(v) => (newPreset = v)}
        label="New preset name"
        placeholder="New preset name…"
        monospace
      />
      <button class="add-btn" type="button" onclick={addPreset} disabled={!newPreset.trim()}>
        Add
      </button>
    </div>
    {#if Object.keys(presets()).length === 0}
      <p class="empty">No presets defined.</p>
    {/if}
    {#each Object.entries(presets()) as [pname, preset]}
      <div class="preset-card">
        <button class="preset-header" type="button" onclick={() => toggle(pname)}>
          <span class="preset-name">{pname}</span>
          <span class="preset-chevron">{expanded.has(pname) ? "▲" : "▼"}</span>
        </button>
        {#if expanded.has(pname)}
          <div class="preset-body">
            <FieldEditor label="Default Model" description="Applied when an entry has no explicit model">
              <StringEditor
                value={preset.default_model ?? ""}
                onChange={(v) => updatePreset(pname, { default_model: v || undefined })}
                label="Default model"
                placeholder="provider/model"
                monospace
              />
            </FieldEditor>
            <FieldEditor label="Agents" description='Format: name=model or name=model (variant)' advanced>
              <ArrayEditor
                value={entryList(preset.agents)}
                onChange={(v) =>
                  updatePreset(pname, {
                    agents: Object.keys(parseEntries(v)).length > 0 ? parseEntries(v) : undefined,
                  })}
                label="Preset agents"
                placeholder="morpheus=provider/model…"
              />
            </FieldEditor>
            <FieldEditor label="Categories" description='Format: name=model or name=model (variant)' advanced>
              <ArrayEditor
                value={entryList(preset.categories)}
                onChange={(v) =>
                  updatePreset(pname, {
                    categories:
                      Object.keys(parseEntries(v)).length > 0 ? parseEntries(v) : undefined,
                  })}
                label="Preset categories"
                placeholder="source=provider/model…"
              />
            </FieldEditor>
            <button class="remove-btn" type="button" onclick={() => removePreset(pname)}>
              Remove preset
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </FieldEditor>

  <FieldEditor label="Model Requirements" description="Config-driven fallback chains and provider constraints (JSON)" advanced>
    <StringEditor
      value={jsonText(config.modelRequirements)}
      onChange={(v) => {
        const parsed = parseJson(v)
        if (v.trim() && parsed === undefined) return
        configStore.updateConfig((c) => ({
          ...c,
          modelRequirements: (parsed ?? undefined) as typeof c.modelRequirements,
        }))
      }}
      label="Model requirements JSON"
      placeholder="agents and categories maps"
      multiline
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Complexity Downgrades" description="Per-category complexity downgrade targets (JSON)" advanced>
    <StringEditor
      value={jsonText(config.complexityDowngrades)}
      onChange={(v) => {
        const parsed = parseJson(v)
        if (v.trim() && parsed === undefined) return
        configStore.updateConfig((c) => ({
          ...c,
          complexityDowngrades: (parsed ?? undefined) as typeof c.complexityDowngrades,
        }))
      }}
      label="Complexity downgrades JSON"
      placeholder="source level to model map"
      multiline
      monospace
    />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1.5rem; }
  .preset-add { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
  .add-btn, .remove-btn { font-size: 0.75rem; padding: 0.375rem 0.625rem; border: 1px solid var(--color-border); border-radius: 0.375rem; background: var(--color-surface); color: var(--color-accent); cursor: pointer; white-space: nowrap; }
  .empty { font-size: 0.8125rem; color: var(--color-text-secondary); }
  .preset-card { border: 1px solid var(--color-border); border-radius: 0.5rem; margin-bottom: 0.5rem; overflow: hidden; }
  .preset-header { display: flex; justify-content: space-between; width: 100%; padding: 0.625rem 0.875rem; border: none; background: none; cursor: pointer; font-family: inherit; }
  .preset-name { font-weight: 600; font-size: 0.875rem; font-family: monospace; }
  .preset-chevron { font-size: 0.6875rem; color: var(--color-text-secondary); }
  .preset-body { padding: 0 0.875rem 0.75rem; border-top: 1px solid var(--color-border); padding-top: 0.75rem; }
</style>
