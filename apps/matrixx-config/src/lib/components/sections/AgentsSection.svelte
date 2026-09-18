<script lang="ts">
  import { configStore } from "$lib/store/config-store"
  import type { AgentOverrideConfig } from "$lib/types"
  import FieldEditor from "$lib/components/config/FieldEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import BooleanEditor from "$lib/components/config/BooleanEditor.svelte"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"
  import ThinkingEditor from "$lib/components/config/ThinkingEditor.svelte"
  import PermissionEditor from "$lib/components/config/PermissionEditor.svelte"
  import ToolsEditor from "$lib/components/config/ToolsEditor.svelte"
  import FallbackChainEditor from "$lib/components/config/FallbackChainEditor.svelte"

  const BUILTIN_AGENTS = [
    "morpheus", "keymaker", "oracle", "merovingian", "operator", "trinity",
    "construct", "seraph", "smith", "architect", "cipher", "sentinel", "sati",
    "bdd-contract", "build", "plan", "mouse", "OpenCode-Builder",
  ] as const

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let expanded = $state<Set<string>>(new Set())
  let searchQuery = $state("")

  const MODE_OPTIONS = [
    { value: "subagent", label: "Subagent" },
    { value: "primary", label: "Primary" },
    { value: "all", label: "All" },
  ]

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

  let filteredAgents = $derived(
    BUILTIN_AGENTS.filter((a) =>
      !searchQuery.trim() || a.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  )

  function toggleAgent(name: string) {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    expanded = next
  }

  function getAgentConfig(name: string): AgentOverrideConfig {
    return config.agents?.[name] ?? {}
  }

  function updateAgent(name: string, patch: Partial<AgentOverrideConfig>) {
    const current = config.agents ?? {}
    const agent = current[name] ?? {}
    configStore.updateConfig((c) => ({
      ...c,
      agents: { ...c.agents, [name]: { ...agent, ...patch } },
    }))
  }
</script>

<div class="section">
  <h2 class="section-title">Agents</h2>
  <p class="section-desc">Override model, temperature, permissions, and other settings for each agent.</p>

  <div class="search-bar">
    <input
      type="search"
      bind:value={searchQuery}
      class="search-input"
      placeholder="Search agents..."
      aria-label="Search agents"
    />
    <span class="search-count">{filteredAgents.length} agents</span>
  </div>

  <div class="agent-list">
    {#each filteredAgents as name}
      {@const agent = getAgentConfig(name)}
      {@const isExpanded = expanded.has(name)}
      <div class="agent-card">
        <button
          class="agent-header"
          onclick={() => toggleAgent(name)}
          aria-expanded={isExpanded}
        >
          <div class="agent-info">
            <span class="agent-name">{name}</span>
            {#if agent.model}
              <span class="agent-tier">{agent.model}</span>
            {/if}
            {#if agent.disable}
              <span class="agent-badge agent-badge--disabled">Disabled</span>
            {/if}
          </div>
          <span class="agent-chevron">{isExpanded ? "▲" : "▼"}</span>
        </button>

        {#if isExpanded}
          <div class="agent-body">
            <FieldEditor label="Model" description="Provider/model string override">
              <StringEditor
                value={agent.model ?? ""}
                onChange={(v) => updateAgent(name, { model: v || undefined })}
                label="Model"
                placeholder="provider/model"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Variant" description="Model variant string (provider-specific)">
              <StringEditor
                value={agent.variant ?? ""}
                onChange={(v) => updateAgent(name, { variant: v || undefined })}
                label="Variant"
                placeholder="variant…"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Category" description="Inherit model and settings from a category">
              <StringEditor
                value={agent.category ?? ""}
                onChange={(v) => updateAgent(name, { category: v || undefined })}
                label="Category"
                placeholder="Category name…"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Skills" description="Skill names injected into the agent prompt">
              <ArrayEditor
                value={agent.skills ?? []}
                onChange={(v) => updateAgent(name, { skills: v.length > 0 ? v : undefined })}
                label="Skills"
                placeholder="Skill name…"
              />
            </FieldEditor>

            <FieldEditor label="Temperature" description="Sampling temperature (0-2)">
              <NumberEditor
                value={agent.temperature ?? 0.1}
                onChange={(v) => updateAgent(name, { temperature: v })}
                label="Temperature"
                min={0}
                max={2}
                step={0.05}
                showSlider
              />
            </FieldEditor>

            <FieldEditor label="Mode" description="Agent invocation mode">
              <EnumEditor
                value={agent.mode ?? ""}
                options={MODE_OPTIONS}
                onChange={(v) => updateAgent(name, { mode: (v || undefined) as typeof agent.mode })}
                label="Mode"
                placeholder="Default"
              />
            </FieldEditor>

            <FieldEditor label="Disable" description="Disable this agent">
              <BooleanEditor
                value={agent.disable ?? false}
                onChange={(v) => updateAgent(name, { disable: v || undefined })}
                label="Disable agent"
              />
            </FieldEditor>

            <FieldEditor label="Prompt Append" description="Text to append to agent prompt. Supports file:// URIs." advanced>
              <StringEditor
                value={agent.prompt_append ?? ""}
                onChange={(v) => updateAgent(name, { prompt_append: v || undefined })}
                label="Prompt append"
                multiline
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Description" description="Agent description" advanced>
              <StringEditor
                value={agent.description ?? ""}
                onChange={(v) => updateAgent(name, { description: v || undefined })}
                label="Description"
                multiline
              />
            </FieldEditor>

            <FieldEditor label="Color" description="Agent color (hex)" advanced>
              <StringEditor
                value={agent.color ?? ""}
                onChange={(v) => updateAgent(name, { color: v || undefined })}
                label="Color"
                placeholder="#RRGGBB"
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Max Tokens" description="Maximum response tokens" advanced>
              <NumberEditor
                value={agent.maxTokens ?? 4096}
                onChange={(v) => updateAgent(name, { maxTokens: v })}
                label="Max tokens"
                min={256}
                max={128000}
                step={1024}
              />
            </FieldEditor>

            <FieldEditor label="Reasoning Effort" description="OpenAI reasoning effort level" advanced>
              <EnumEditor
                value={agent.reasoningEffort ?? ""}
                options={EFFORT_OPTIONS}
                onChange={(v) => updateAgent(name, { reasoningEffort: (v || undefined) as typeof agent.reasoningEffort })}
                label="Reasoning effort"
                placeholder="Default"
              />
            </FieldEditor>

            <FieldEditor label="Top P" description="Nucleus sampling threshold (0-1)" advanced>
              <NumberEditor
                value={agent.top_p ?? 1}
                onChange={(v) => updateAgent(name, { top_p: v })}
                label="Top P"
                min={0}
                max={1}
                step={0.05}
                showSlider
              />
            </FieldEditor>

            <FieldEditor label="Prompt" description="Full prompt override (replaces built-in prompt)" advanced>
              <StringEditor
                value={agent.prompt ?? ""}
                onChange={(v) => updateAgent(name, { prompt: v || undefined })}
                label="Prompt"
                multiline
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Tools" description="Per-tool enable/disable overrides" advanced>
              <ToolsEditor
                value={agent.tools}
                onChange={(v) => updateAgent(name, { tools: v })}
                label="Agent tools"
              />
            </FieldEditor>

            <FieldEditor label="Permission" description="Tool permission policy per capability" advanced>
              <PermissionEditor
                value={agent.permission}
                onChange={(v) => updateAgent(name, { permission: v })}
              />
            </FieldEditor>

            <FieldEditor label="Thinking" description="Extended thinking config (Anthropic)" advanced>
              <ThinkingEditor
                value={agent.thinking}
                onChange={(v) => updateAgent(name, { thinking: v })}
              />
            </FieldEditor>

            <FieldEditor label="Fallback chain" description="Custom model fallback chain for this agent" advanced>
              <FallbackChainEditor
                value={agent.fallbackChain}
                onChange={(v) => updateAgent(name, { fallbackChain: v })}
              />
            </FieldEditor>

            <FieldEditor label="Provider Options (JSON)" description="Provider-specific options passed to the SDK" advanced>
              <StringEditor
                value={agent.providerOptions ? JSON.stringify(agent.providerOptions, null, 2) : ""}
                onChange={(v) => {
                  if (!v.trim()) {
                    updateAgent(name, { providerOptions: undefined })
                    return
                  }
                  try {
                    updateAgent(name, { providerOptions: JSON.parse(v) as Record<string, unknown> })
                  } catch { /* keep draft */ }
                }}
                label="Provider options"
                multiline
                monospace
              />
            </FieldEditor>

            <FieldEditor label="Text Verbosity" description="Text verbosity level" advanced>
              <EnumEditor
                value={agent.textVerbosity ?? ""}
                options={VERBOSITY_OPTIONS}
                onChange={(v) => updateAgent(name, { textVerbosity: (v || undefined) as typeof agent.textVerbosity })}
                label="Text verbosity"
                placeholder="Default"
              />
            </FieldEditor>
          </div>
        {/if}
      </div>
    {/each}
  </div>
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
    margin: 0 0 1rem;
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .search-input {
    flex: 1;
    max-width: 20rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.875rem;
  }

  .search-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .search-count {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
  }

  .agent-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .agent-card {
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: var(--color-surface);
    overflow: hidden;
  }

  .agent-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .agent-header:hover {
    background: oklch(0.96 0 0);
  }

  .agent-header:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .agent-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .agent-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .agent-tier {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: oklch(0.55 0.18 265 / 0.1);
    color: var(--color-accent);
    text-transform: uppercase;
  }

  .agent-badge {
    font-size: 0.6875rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    text-transform: uppercase;
    font-weight: 500;
  }

  .agent-badge--disabled {
    background: oklch(0.92 0.03 25 / 0.3);
    color: oklch(0.5 0.15 25);
  }

  .agent-chevron {
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
  }

  .agent-body {
    padding: 0 1rem 0.75rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.75rem;
  }
</style>
