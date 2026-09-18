<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  const SCOPE_OPTIONS = [
    { value: "project", label: "Project" },
    { value: "global", label: "Global" },
  ]
</script>

<div class="section">
  <h2 class="section-title">Tasks</h2>
  <p class="section-desc">File-backed task system, storage scope, and orchestrator toggles.</p>

  <FieldEditor label="Enabled" description="Master switch for the file-backed task system">
    <BooleanEditor
      value={config.tasks?.enabled ?? true}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, tasks: { ...c.tasks, enabled: v } }))}
      label="Tasks enabled"
    />
  </FieldEditor>

  <FieldEditor label="Scope" description="Project uses .matrixx/tasks; global uses shared task dir">
    <EnumEditor
      value={config.tasks?.scope ?? ""}
      options={SCOPE_OPTIONS}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          tasks: { ...c.tasks, scope: (v || undefined) as "project" | "global" },
        }))}
      label="Task scope"
      placeholder="Default (project)"
    />
  </FieldEditor>

  <FieldEditor label="Storage Path" description="Absolute or relative path override">
    <StringEditor
      value={config.tasks?.storage_path ?? ""}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          tasks: { ...c.tasks, storage_path: v || undefined },
        }))}
      label="Storage path"
      placeholder=".matrixx/tasks"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Task List ID" description="Force task list ID (alternative to env var)">
    <StringEditor
      value={config.tasks?.task_list_id ?? ""}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          tasks: { ...c.tasks, task_list_id: v || undefined },
        }))}
      label="Task list ID"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Stale After (hours)" description="Pending tasks older than this are stale" advanced>
    <NumberEditor
      value={config.tasks?.stale_after_hours ?? 24}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, tasks: { ...c.tasks, stale_after_hours: v } }))}
      label="Stale hours"
      min={1}
      max={720}
      step={1}
    />
  </FieldEditor>

  <FieldEditor label="Session Scoped" description="Only current-session tasks drive directives" advanced>
    <BooleanEditor
      value={config.tasks?.session_scoped ?? true}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, tasks: { ...c.tasks, session_scoped: v } }))}
      label="Session scoped"
    />
  </FieldEditor>

  <FieldEditor label="Poll Timeout (ms)" description="Blocking task() poll budget, min 60000">
    <NumberEditor
      value={config.tasks?.pollTimeoutMs ?? 600000}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, tasks: { ...c.tasks, pollTimeoutMs: v } }))}
      label="Poll timeout"
      min={60000}
      max={3600000}
      step={60000}
    />
  </FieldEditor>

  <FieldEditor label="Legacy Poll Timeout" description="Deprecated task.pollTimeoutMs fallback" advanced>
    <NumberEditor
      value={config.task?.pollTimeoutMs ?? 600000}
      onChange={(v) =>
        configStore.updateConfig((c) => ({ ...c, task: { ...c.task, pollTimeoutMs: v } }))}
      label="Legacy poll timeout"
      min={60000}
      max={3600000}
      step={60000}
    />
  </FieldEditor>

  <FieldEditor label="Morpheus Tasks (legacy)" description="Deprecated morpheus.tasks fallback" advanced>
    <StringEditor
      value={config.morpheus?.tasks?.storage_path ?? ""}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus: { ...c.morpheus, tasks: { ...c.morpheus?.tasks, storage_path: v || undefined } },
        }))}
      label="Morpheus storage path"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Morpheus Scope" advanced>
    <EnumEditor
      value={config.morpheus?.tasks?.scope ?? ""}
      options={SCOPE_OPTIONS}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus: {
            ...c.morpheus,
            tasks: { ...c.morpheus?.tasks, scope: (v || undefined) as "project" | "global" },
          },
        }))}
      label="Morpheus scope"
      placeholder="Default"
    />
  </FieldEditor>

  <FieldEditor label="Morpheus List ID" advanced>
    <StringEditor
      value={config.morpheus?.tasks?.task_list_id ?? ""}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus: {
            ...c.morpheus,
            tasks: { ...c.morpheus?.tasks, task_list_id: v || undefined },
          },
        }))}
      label="Morpheus list"
      monospace
    />
  </FieldEditor>

  <FieldEditor label="Morpheus Stale Hours" advanced>
    <NumberEditor
      value={config.morpheus?.tasks?.stale_after_hours ?? 24}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus: { ...c.morpheus, tasks: { ...c.morpheus?.tasks, stale_after_hours: v } },
        }))}
      label="Morpheus stale"
      min={1}
      max={720}
      step={1}
    />
  </FieldEditor>

  <FieldEditor label="Morpheus Session Scoped" advanced>
    <BooleanEditor
      value={config.morpheus?.tasks?.session_scoped ?? true}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus: { ...c.morpheus, tasks: { ...c.morpheus?.tasks, session_scoped: v } },
        }))}
      label="Morpheus scoped"
    />
  </FieldEditor>

  <FieldEditor label="Morpheus Agent" description="Master orchestrator toggles">
    <BooleanEditor
      value={!(config.morpheus_agent?.disabled ?? false)}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus_agent: { ...c.morpheus_agent, disabled: !v || undefined },
        }))}
      label="Morpheus enabled"
    />
  </FieldEditor>

  <FieldEditor label="Default Builder" description="Enable OpenCode-Builder agent" advanced>
    <BooleanEditor
      value={config.morpheus_agent?.default_builder_enabled ?? false}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus_agent: { ...c.morpheus_agent, default_builder_enabled: v || undefined },
        }))}
      label="Default builder"
    />
  </FieldEditor>

  <FieldEditor label="Planner" description="Enable Oracle planner agent" advanced>
    <BooleanEditor
      value={config.morpheus_agent?.planner_enabled ?? true}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus_agent: { ...c.morpheus_agent, planner_enabled: v },
        }))}
      label="Planner enabled"
    />
  </FieldEditor>

  <FieldEditor label="Replace Plan" description="Demote default plan agent to subagent mode" advanced>
    <BooleanEditor
      value={config.morpheus_agent?.replace_plan ?? true}
      onChange={(v) =>
        configStore.updateConfig((c) => ({
          ...c,
          morpheus_agent: { ...c.morpheus_agent, replace_plan: v },
        }))}
      label="Replace plan"
    />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1.5rem; }
</style>
