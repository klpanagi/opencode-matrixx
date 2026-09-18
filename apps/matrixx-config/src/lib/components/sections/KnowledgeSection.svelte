<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { KnowledgeHub } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  const SCOPE_OPTIONS = [
    { value: "global", label: "Global" },
    { value: "project", label: "Project" },
  ]
  const MODE_OPTIONS = [
    { value: "router-only", label: "Router only" },
    { value: "pinned", label: "Pinned" },
  ]

  function hubs(): KnowledgeHub[] {
    return config.knowledge?.hubs ?? []
  }

  function setHubs(h: KnowledgeHub[]) {
    configStore.updateConfig((c) => ({ ...c, knowledge: { ...c.knowledge, hubs: h } }))
  }

  function addHub() {
    setHubs([...hubs(), { name: "", path: "" }])
  }

  function skillsObj(): Record<string, unknown> {
    const s = config.skills
    if (s && !Array.isArray(s)) return s as Record<string, unknown>
    return {}
  }

  function isArrayForm(): boolean {
    return Array.isArray(config.skills)
  }
</script>

<div class="section">
  <h2 class="section-title">Knowledge & Skills</h2>
  <p class="section-desc">Hub registry, skill sources, and external agent definitions.</p>

  <h3 class="group">Knowledge Hubs</h3>
  {#if hubs().length === 0}
    <p class="empty">No hubs registered.</p>
  {/if}
  {#each hubs() as hub, i}
    <div class="hub-card">
      <div class="hub-header">
        <span class="hub-index">Hub #{i + 1}</span>
        <button class="remove-btn" type="button" onclick={() => setHubs(hubs().filter((_, j) => j !== i))}>
          Remove
        </button>
      </div>
      <FieldEditor label="Name">
        <StringEditor value={hub.name} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, name: v }; setHubs(n) }} label="Hub name" monospace />
      </FieldEditor>
      <FieldEditor label="Path">
        <StringEditor value={hub.path} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, path: v }; setHubs(n) }} label="Hub path" monospace />
      </FieldEditor>
      <FieldEditor label="Index" advanced>
        <StringEditor value={hub.index ?? "_index.md"} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, index: v || undefined }; setHubs(n) }} label="Index" monospace />
      </FieldEditor>
      <FieldEditor label="Scope" advanced>
        <EnumEditor value={hub.scope ?? ""} options={SCOPE_OPTIONS} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, scope: (v || undefined) as KnowledgeHub["scope"] }; setHubs(n) }} label="Scope" placeholder="Default" />
      </FieldEditor>
      <FieldEditor label="Mode" advanced>
        <EnumEditor value={hub.mode ?? ""} options={MODE_OPTIONS} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, mode: (v || undefined) as KnowledgeHub["mode"] }; setHubs(n) }} label="Mode" placeholder="Default" />
      </FieldEditor>
      <FieldEditor label="Exclude" advanced>
        <ArrayEditor value={hub.exclude ?? []} onChange={(v) => { const n = [...hubs()]; n[i] = { ...hub, exclude: v.length > 0 ? v : undefined }; setHubs(n) }} label="Exclude" placeholder="glob…" />
      </FieldEditor>
    </div>
  {/each}
  <button class="add-btn" type="button" onclick={addHub}>Add hub</button>

  <h3 class="group">Skills</h3>
  {#if isArrayForm()}
    <FieldEditor label="Skills (shorthand array)">
      <ArrayEditor
        value={config.skills as string[]}
        onChange={(v) => configStore.updateConfig((c) => ({ ...c, skills: v.length > 0 ? v : undefined }))}
        label="Skills"
        placeholder="Skill name…"
      />
    </FieldEditor>
    <button
      class="add-btn"
      type="button"
      onclick={() => configStore.updateConfig((c) => ({ ...c, skills: { enable: [...(c.skills as string[] ?? [])] } }))}
    >
      Switch to object form
    </button>
  {:else}
    <FieldEditor label="Enable">
      <ArrayEditor
        value={(skillsObj().enable as string[]) ?? []}
        onChange={(v) => configStore.updateConfig((c) => ({ ...c, skills: { ...((c.skills as object) ?? {}), enable: v.length > 0 ? v : undefined } }))}
        label="Enable"
        placeholder="Skill…"
      />
    </FieldEditor>
    <FieldEditor label="Disable">
      <ArrayEditor
        value={(skillsObj().disable as string[]) ?? []}
        onChange={(v) => configStore.updateConfig((c) => ({ ...c, skills: { ...((c.skills as object) ?? {}), disable: v.length > 0 ? v : undefined } }))}
        label="Disable"
        placeholder="Skill…"
      />
    </FieldEditor>
    <FieldEditor label="Sources" description="Paths or URLs" advanced>
      <ArrayEditor
        value={((skillsObj().sources as Array<string | { path: string }>) ?? []).map((s) => (typeof s === "string" ? s : s.path))}
        onChange={(v) => configStore.updateConfig((c) => ({ ...c, skills: { ...((c.skills as object) ?? {}), sources: v.length > 0 ? v : undefined } }))}
        label="Sources"
        placeholder="Path or URL…"
      />
    </FieldEditor>
    <FieldEditor label="Custom Skill Definitions (JSON)" description="Named skill entries beyond enable/disable/sources" advanced>
      <StringEditor
        value={(() => {
          const o = { ...skillsObj() }
          delete o.enable
          delete o.disable
          delete o.sources
          return Object.keys(o).length > 0 ? JSON.stringify(o, null, 2) : ""
        })()}
        onChange={(v) => {
          const base = skillsObj()
          if (!v.trim()) {
            const next: Record<string, unknown> = {}
            if (base.enable) next.enable = base.enable
            if (base.disable) next.disable = base.disable
            if (base.sources) next.sources = base.sources
            configStore.updateConfig((c) => ({ ...c, skills: next }))
            return
          }
          try {
            const parsed = JSON.parse(v) as Record<string, unknown>
            configStore.updateConfig((c) => ({ ...c, skills: { ...base, ...parsed } }))
          } catch { /* keep draft */ }
        }}
        label="Custom skills JSON"
        multiline
        monospace
      />
    </FieldEditor>
  {/if}

  <h3 class="group">Agent Definitions</h3>
  <FieldEditor label="Definition Paths" description="Paths to external agent definition files">
    <ArrayEditor
      value={config.agent_definitions ?? []}
      onChange={(v) => configStore.updateConfig((c) => ({ ...c, agent_definitions: v.length > 0 ? v : undefined }))}
      label="Definitions"
      placeholder="Path…"
    />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
  .group { font-size: 0.9375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
  .empty { font-size: 0.8125rem; color: var(--color-text-secondary); }
  .hub-card { border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.75rem 0.875rem; margin-bottom: 0.625rem; }
  .hub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
  .hub-index { font-size: 0.8125rem; font-weight: 600; }
  .add-btn, .remove-btn { font-size: 0.75rem; padding: 0.375rem 0.625rem; border: 1px solid var(--color-border); border-radius: 0.375rem; color: var(--color-accent); background: transparent; cursor: pointer; }
</style>
