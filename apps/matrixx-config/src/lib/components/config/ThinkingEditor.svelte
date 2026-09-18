<script lang="ts">
  import type { ThinkingConfig } from "$lib/types"
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import NumberEditor from "$lib/components/config/NumberEditor.svelte"

  let {
    value,
    onChange,
  }: {
    value?: ThinkingConfig
    onChange?: (v: ThinkingConfig | undefined) => void
  } = $props()

  const TYPE_OPTIONS = [
    { value: "enabled", label: "Enabled" },
    { value: "disabled", label: "Disabled" },
  ]

  function update(patch: Partial<ThinkingConfig>) {
    onChange?.({ type: value?.type ?? "enabled", ...value, ...patch })
  }

  function clear() {
    onChange?.(undefined)
  }
</script>

<div class="thinking-editor">
  <EnumEditor
    value={value?.type ?? ""}
    options={TYPE_OPTIONS}
    onChange={(v) => (v ? update({ type: v as "enabled" | "disabled" }) : clear())}
    label="Thinking type"
    placeholder="Not set"
  />
  {#if value?.type === "enabled"}
    <div class="thinking-budget">
      <span class="thinking-label">Budget tokens</span>
      <NumberEditor
        value={value.budgetTokens ?? 32000}
        onChange={(v) => update({ budgetTokens: v })}
        label="Budget tokens"
        min={1024}
        max={128000}
        step={1024}
      />
    </div>
  {/if}
</div>

<style>
  .thinking-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .thinking-budget {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .thinking-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
</style>
