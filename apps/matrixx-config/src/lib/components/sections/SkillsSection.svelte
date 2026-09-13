<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { SkillsConfig } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let expanded = $state(false)

  function getSkillsConfig(): SkillsConfig {
    const s = config.skills
    if (Array.isArray(s)) return { enable: s }
    return s ?? {}
  }

  function updateSkills(patch: Partial<SkillsConfig>) {
    const current = getSkillsConfig()
    configStore.updateConfig((c) => ({
      ...c,
      skills: { ...current, ...patch },
    }))
  }

  function setSkillsArray(v: string[]) {
    configStore.updateConfig((c) => ({
      ...c,
      skills: v.length > 0 ? v : undefined,
    }))
  }

  const isArrayForm = $derived(Array.isArray(config.skills))
</script>

<div class="section">
  <h2 class="section-title">Skills</h2>
  <p class="section-desc">Skill sources, enable/disable lists, and custom skill definitions.</p>

  <FieldEditor
    label="Skills Array"
    description="Shorthand: array of skill names to enable"
  >
    <div class="form-toggle">
      <span class="form-type">
        {isArrayForm ? "Array form (shorthand)" : "Object form (advanced)"}
      </span>
    </div>
    {#if isArrayForm}
      <ArrayEditor
        value={(config.skills as string[]) ?? []}
        onChange={setSkillsArray}
        label="Skills"
        placeholder="Skill name..."
      />
    {:else}
      {@const skills = getSkillsConfig()}
      <FieldEditor label="Enable" description="Skills to explicitly enable">
        <ArrayEditor
          value={skills.enable ?? []}
          onChange={(v) => updateSkills({ enable: v.length > 0 ? v : undefined })}
          label="Enable skills"
          placeholder="Skill name..."
        />
      </FieldEditor>

      <FieldEditor label="Disable" description="Skills to explicitly disable">
        <ArrayEditor
          value={skills.disable ?? []}
          onChange={(v) => updateSkills({ disable: v.length > 0 ? v : undefined })}
          label="Disable skills"
          placeholder="Skill name..."
        />
      </FieldEditor>

      <FieldEditor label="Sources" description="External skill sources (paths or URLs)" advanced>
        <ArrayEditor
          value={(skills.sources ?? []).map((s) => (typeof s === "string" ? s : s.path))}
          onChange={(v) => updateSkills({ sources: v.length > 0 ? v : undefined })}
          label="Skill sources"
          placeholder="Path or URL..."
        />
      </FieldEditor>
    {/if}
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }

  .form-toggle {
    margin-bottom: 0.5rem;
  }

  .form-type {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-family: monospace;
  }
</style>
