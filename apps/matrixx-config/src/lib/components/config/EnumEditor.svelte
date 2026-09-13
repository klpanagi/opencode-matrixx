<script lang="ts">
  let {
    value = "",
    options,
    onChange,
    label,
    placeholder = "Select...",
  }: {
    value?: string
    options: Array<{ value: string; label: string }>
    onChange?: (v: string) => void
    label: string
    placeholder?: string
  } = $props()

  let selected = $state(value ?? "")

  $effect(() => {
    selected = value ?? ""
  })

  function handleChange(e: Event) {
    const target = e.currentTarget as HTMLSelectElement
    selected = target.value
    onChange?.(selected)
  }
</script>

<div class="enum-editor">
  <select
    class="enum-select"
    value={selected}
    onchange={handleChange}
    aria-label={label}
  >
    <option value="" disabled>{placeholder}</option>
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
  {#if selected}
    <span class="enum-value">{selected}</span>
  {/if}
</div>

<style>
  .enum-editor {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .enum-select {
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    min-width: 8rem;
  }

  .enum-select:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .enum-value {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    font-family: monospace;
  }
</style>
