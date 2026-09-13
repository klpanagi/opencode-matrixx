<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { MatrixxConfig, TierName } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  const TIER_OPTIONS = [
    { value: "free", label: "Free" },
    { value: "fast", label: "Fast" },
    { value: "standard", label: "Standard" },
    { value: "premium", label: "Premium" },
    { value: "frontier", label: "Frontier" },
  ]

  function update<K extends keyof MatrixxConfig>(key: K, value: MatrixxConfig[K]) {
    configStore.updateConfig((c) => ({ ...c, [key]: value }))
  }
</script>

<div class="section">
  <h2 class="section-title">Core Configuration</h2>
  <p class="section-desc">Global settings, model defaults, and feature toggles.</p>

  <FieldEditor label="Global Model" description="Override model for ALL agents and categories. Format: provider/model">
    <StringEditor
      value={config.global_model ?? ""}
      onChange={(v) => update("global_model", v || undefined)}
      label="Global model"
      placeholder="e.g., openai/gpt-5.2"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Default Tier" description="Default tier applied to agents/categories without explicit model or tier">
    <EnumEditor
      value={config.default_tier ?? ""}
      options={TIER_OPTIONS}
      onChange={(v) => update("default_tier", (v || undefined) as TierName)}
      label="Default tier"
      placeholder="Not set"
    />
  </FieldEditor>

  <FieldEditor label="Default Run Agent" description="Default agent for `opencode run`">
    <StringEditor
      value={config.default_run_agent ?? ""}
      onChange={(v) => update("default_run_agent", v || undefined)}
      label="Default run agent"
      placeholder="morpheus"
    />
  </FieldEditor>

  <FieldEditor label="Auto Update" description="Automatically update Matrixx when a new version is available">
    <BooleanEditor
      value={config.auto_update ?? false}
      onChange={(v) => update("auto_update", v || undefined)}
      label="Auto update"
    />
  </FieldEditor>

  <FieldEditor label="Task System" description="Enable experimental file-backed task system">
    <BooleanEditor
      value={config.experimental?.task_system ?? true}
      onChange={(v) => update("experimental", { ...config.experimental, task_system: v })}
      label="Task system"
    />
  </FieldEditor>

  <FieldEditor label="Disabled Agents" description="Built-in agents to disable" advanced>
    <ArrayEditor
      value={config.disabled_agents ?? []}
      onChange={(v) => update("disabled_agents", v.length > 0 ? v : undefined)}
      label="Disabled agents"
      placeholder="Agent name..."
    />
  </FieldEditor>

  <FieldEditor label="Disabled Skills" description="Built-in skills to disable" advanced>
    <ArrayEditor
      value={config.disabled_skills ?? []}
      onChange={(v) => update("disabled_skills", v.length > 0 ? v : undefined)}
      label="Disabled skills"
      placeholder="Skill name..."
    />
  </FieldEditor>

  <FieldEditor label="Disabled Hooks" description="Built-in hooks to disable" advanced>
    <ArrayEditor
      value={config.disabled_hooks ?? []}
      onChange={(v) => update("disabled_hooks", v.length > 0 ? v : undefined)}
      label="Disabled hooks"
      placeholder="Hook name..."
    />
  </FieldEditor>

  <FieldEditor label="Disabled Commands" description="Built-in slash commands to disable" advanced>
    <ArrayEditor
      value={config.disabled_commands ?? []}
      onChange={(v) => update("disabled_commands", v.length > 0 ? v : undefined)}
      label="Disabled commands"
      placeholder="Command name..."
    />
  </FieldEditor>

  <FieldEditor label="Disabled Tools" description="Tools to disable (e.g., todowrite, todoread)" advanced>
    <ArrayEditor
      value={config.disabled_tools ?? []}
      onChange={(v) => update("disabled_tools", v.length > 0 ? v : undefined)}
      label="Disabled tools"
      placeholder="Tool name..."
    />
  </FieldEditor>

  <FieldEditor label="Disabled MCPs" description="Built-in MCP servers to disable" advanced>
    <ArrayEditor
      value={config.disabled_mcps ?? []}
      onChange={(v) => update("disabled_mcps", v.length > 0 ? v : undefined)}
      label="Disabled MCPs"
      placeholder="MCP name..."
    />
  </FieldEditor>
</div>

<style>
  .section {
    max-width: 48rem;
  }

  .section-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 0.25rem;
  }

  .section-desc {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin: 0 0 1.5rem;
  }
</style>
