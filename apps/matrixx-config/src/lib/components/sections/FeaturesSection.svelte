<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  const BROWSER_OPTIONS = [
    { value: "playwright", label: "Playwright" },
    { value: "agent-browser", label: "Agent Browser" },
    { value: "dev-browser", label: "Dev Browser" },
    { value: "playwright-cli", label: "Playwright CLI" },
  ]
  const WEBSEARCH_OPTIONS = [
    { value: "exa", label: "Exa" },
    { value: "tavily", label: "Tavily" },
  ]
  const TMUX_OPTIONS = [
    { value: "main-horizontal", label: "Main horizontal" },
    { value: "main-vertical", label: "Main vertical" },
    { value: "tiled", label: "Tiled" },
    { value: "even-horizontal", label: "Even horizontal" },
    { value: "even-vertical", label: "Even vertical" },
  ]

  function exp(patch: Record<string, unknown>) {
    configStore.updateConfig((c) => ({ ...c, experimental: { ...c.experimental, ...patch } }))
  }
</script>

<div class="section">
  <h2 class="section-title">Features</h2>
  <p class="section-desc">Experimental flags and opt-in capabilities.</p>

  <h3 class="group">Experimental</h3>
  <FieldEditor label="Aggressive Truncation" advanced>
    <BooleanEditor value={config.experimental?.aggressive_truncation ?? false} onChange={(v) => exp({ aggressive_truncation: v || undefined })} label="Aggressive truncation" />
  </FieldEditor>
  <FieldEditor label="Auto Resume" advanced>
    <BooleanEditor value={config.experimental?.auto_resume ?? false} onChange={(v) => exp({ auto_resume: v || undefined })} label="Auto resume" />
  </FieldEditor>
  <FieldEditor label="Preemptive Compaction" advanced>
    <BooleanEditor value={config.experimental?.preemptive_compaction ?? false} onChange={(v) => exp({ preemptive_compaction: v || undefined })} label="Preemptive compaction" />
  </FieldEditor>
  <FieldEditor label="Truncate All Tool Outputs" advanced>
    <BooleanEditor value={config.experimental?.truncate_all_tool_outputs ?? false} onChange={(v) => exp({ truncate_all_tool_outputs: v || undefined })} label="Truncate all" />
  </FieldEditor>
  <FieldEditor label="Legacy Task System Flag" description="Deprecated fallback for tasks.enabled" advanced>
    <BooleanEditor value={config.experimental?.task_system ?? true} onChange={(v) => exp({ task_system: v })} label="Task system" />
  </FieldEditor>
  <FieldEditor label="Plugin Load Timeout (ms)" advanced>
    <NumberEditor value={config.experimental?.plugin_load_timeout_ms ?? 10000} onChange={(v) => exp({ plugin_load_timeout_ms: v })} label="Load timeout" min={1000} max={120000} step={1000} />
  </FieldEditor>
  <FieldEditor label="Warning Threshold (0.1-0.95)" advanced>
    <NumberEditor value={config.experimental?.context_warning_threshold ?? 0.7} onChange={(v) => exp({ context_warning_threshold: v })} label="Warning threshold" min={0.1} max={0.95} step={0.01} showSlider />
  </FieldEditor>
  <FieldEditor label="Compaction Threshold (0.1-0.95)" advanced>
    <NumberEditor value={config.experimental?.preemptive_compaction_threshold ?? 0.78} onChange={(v) => exp({ preemptive_compaction_threshold: v })} label="Compaction threshold" min={0.1} max={0.95} step={0.01} showSlider />
  </FieldEditor>
  <FieldEditor label="Safe Hook Creation" advanced>
    <BooleanEditor value={config.experimental?.safe_hook_creation ?? true} onChange={(v) => exp({ safe_hook_creation: v })} label="Safe hooks" />
  </FieldEditor>
  <FieldEditor label="Hashline Edit" advanced>
    <BooleanEditor value={config.experimental?.hashline_edit ?? false} onChange={(v) => exp({ hashline_edit: v || undefined })} label="Hashline edit" />
  </FieldEditor>

  <h3 class="group">Quality & Workflow</h3>
  <FieldEditor label="TDD Enforcer" description="RED-GREEN-REFACTOR enforcement">
    <BooleanEditor value={config.tdd_enforcer?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tdd_enforcer: { ...c.tdd_enforcer, enabled: v } }))} label="TDD enforcer" />
  </FieldEditor>
  <FieldEditor label="Matrix Loop" description="Matrix loop functionality">
    <BooleanEditor value={config.matrix_loop?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, matrix_loop: { ...c.matrix_loop, enabled: v } }))} label="Matrix loop" />
  </FieldEditor>
  <FieldEditor label="Max Iterations" advanced>
    <NumberEditor value={config.matrix_loop?.default_max_iterations ?? 100} onChange={(v) => configStore.updateConfig((c) => ({ ...c, matrix_loop: { ...c.matrix_loop, default_max_iterations: v } }))} label="Max iterations" min={1} max={1000} step={1} />
  </FieldEditor>
  <FieldEditor label="State Dir" advanced>
    <StringEditor value={config.matrix_loop?.state_dir ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, matrix_loop: { ...c.matrix_loop, state_dir: v || undefined } }))} label="State dir" monospace />
  </FieldEditor>
  <FieldEditor label="Failure Counter" description="Gate after consecutive failures">
    <BooleanEditor value={config.failure_counter?.enabled ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, failure_counter: { ...c.failure_counter, enabled: v } }))} label="Failure counter" />
  </FieldEditor>
  <FieldEditor label="Failure Threshold" advanced>
    <NumberEditor value={config.failure_counter?.threshold ?? 2} onChange={(v) => configStore.updateConfig((c) => ({ ...c, failure_counter: { ...c.failure_counter, threshold: v } }))} label="Threshold" min={1} max={10} step={1} />
  </FieldEditor>
  <FieldEditor label="Reset On Success" advanced>
    <BooleanEditor value={config.failure_counter?.resetOnSuccess ?? true} onChange={(v) => configStore.updateConfig((c) => ({ ...c, failure_counter: { ...c.failure_counter, resetOnSuccess: v } }))} label="Reset on success" />
  </FieldEditor>
  <FieldEditor label="Force Notifications" advanced>
    <BooleanEditor value={config.notification?.force_enable ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, notification: { ...c.notification, force_enable: v || undefined } }))} label="Force notifications" />
  </FieldEditor>
  <FieldEditor label="Babysitting Timeout (ms)" advanced>
    <NumberEditor value={config.babysitting?.timeout_ms ?? 120000} onChange={(v) => configStore.updateConfig((c) => ({ ...c, babysitting: { timeout_ms: v } }))} label="Babysit timeout" min={10000} max={3600000} step={10000} />
  </FieldEditor>
  <FieldEditor label="Comment Checker Prompt" description="Supports a comments placeholder token" advanced>
    <StringEditor value={config.comment_checker?.custom_prompt ?? ""} onChange={(v) => configStore.updateConfig((c) => ({ ...c, comment_checker: { custom_prompt: v || undefined } }))} label="Custom prompt" multiline monospace />
  </FieldEditor>

  <h3 class="group">Providers & Terminal</h3>
  <FieldEditor label="Browser Automation" description="Provider for the playwright skill">
    <EnumEditor value={config.browser_automation_engine?.provider ?? ""} options={BROWSER_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, browser_automation_engine: { provider: (v || undefined) as "playwright" | "agent-browser" | "dev-browser" | "playwright-cli" | undefined } }))} label="Browser provider" placeholder="Default (playwright)" />
  </FieldEditor>
  <FieldEditor label="Websearch Provider" description="Exa works without a key; Tavily needs TAVILY_API_KEY">
    <EnumEditor value={config.websearch?.provider ?? ""} options={WEBSEARCH_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, websearch: { provider: (v || undefined) as "exa" | "tavily" | undefined } }))} label="Websearch" placeholder="Default (exa)" />
  </FieldEditor>
  <FieldEditor label="Tmux Enabled">
    <BooleanEditor value={config.tmux?.enabled ?? false} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tmux: { ...c.tmux, enabled: v } }))} label="Tmux" />
  </FieldEditor>
  <FieldEditor label="Tmux Layout" advanced>
    <EnumEditor value={config.tmux?.layout ?? ""} options={TMUX_OPTIONS} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tmux: { ...c.tmux, layout: (v || undefined) as "main-horizontal" | "main-vertical" | "tiled" | "even-horizontal" | "even-vertical" | undefined } }))} label="Layout" placeholder="Default" />
  </FieldEditor>
  <FieldEditor label="Main Pane Size (20-80)" advanced>
    <NumberEditor value={config.tmux?.main_pane_size ?? 60} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tmux: { ...c.tmux, main_pane_size: v } }))} label="Pane size" min={20} max={80} step={1} showSlider />
  </FieldEditor>
  <FieldEditor label="Main Pane Min Width" advanced>
    <NumberEditor value={config.tmux?.main_pane_min_width ?? 120} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tmux: { ...c.tmux, main_pane_min_width: v } }))} label="Min width" min={40} max={500} step={10} />
  </FieldEditor>
  <FieldEditor label="Agent Pane Min Width" advanced>
    <NumberEditor value={config.tmux?.agent_pane_min_width ?? 40} onChange={(v) => configStore.updateConfig((c) => ({ ...c, tmux: { ...c.tmux, agent_pane_min_width: v } }))} label="Agent width" min={20} max={300} step={5} />
  </FieldEditor>
</div>

<style>
  .section { max-width: 48rem; }
  .section-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); margin: 0 0 0.25rem; }
  .section-desc { font-size: 0.875rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
  .group { font-size: 0.9375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; color: var(--color-text-primary); }
</style>
