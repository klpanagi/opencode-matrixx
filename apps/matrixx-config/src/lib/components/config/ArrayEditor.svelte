<script lang="ts">
  let {
    value = [] as string[],
    onChange,
    label,
    placeholder = "Add item...",
  }: {
    value?: string[]
    onChange?: (v: string[]) => void
    label: string
    placeholder?: string
  } = $props()

  // svelte-ignore state_referenced_locally (intentional: local draft synced back via $effect)
  let items = $state([...(value ?? [])])
  let newItem = $state("")

  $effect(() => {
    items = [...(value ?? [])]
  })

  function emit() {
    onChange?.([...items])
  }

  function addItem() {
    const trimmed = newItem.trim()
    if (trimmed && !items.includes(trimmed)) {
      items = [...items, trimmed]
      newItem = ""
      emit()
    }
  }

  function removeItem(index: number) {
    items = items.filter((_, i) => i !== index)
    emit()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault()
      addItem()
    }
  }
</script>

<div class="array-editor" role="group" aria-label={label}>
  <div class="array-items" role="list">
    {#each items as item, i}
      <div class="array-item" role="listitem">
        <span class="array-item-value">{item}</span>
        <button
          class="array-item-remove"
          onclick={() => removeItem(i)}
          aria-label={`Remove ${item}`}
          type="button"
        >&times;</button>
      </div>
    {/each}
    {#if items.length === 0}
      <p class="array-empty">No items</p>
    {/if}
  </div>
  <div class="array-add">
    <input
      type="text"
      bind:value={newItem}
      onkeydown={handleKeydown}
      placeholder={placeholder}
      class="array-input"
      aria-label={`Add ${label}`}
    />
    <button
      class="array-add-btn"
      onclick={addItem}
      disabled={!newItem.trim()}
      type="button"
    >Add</button>
  </div>
</div>

<style>
  .array-editor {
    width: 100%;
  }

  .array-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
    min-height: 1.5rem;
  }

  .array-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.1875rem 0.5rem;
    background: oklch(0.93 0.02 265 / 0.25);
    border: 1px solid oklch(0.88 0.03 265 / 0.3);
    border-radius: 0.25rem;
    font-size: 0.8125rem;
    font-family: monospace;
  }

  .array-item-value {
    color: var(--color-text-primary);
  }

  .array-item-remove {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    border-radius: 0.125rem;
  }

  .array-item-remove:hover {
    color: oklch(0.5 0.2 25);
  }

  .array-empty {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    font-style: italic;
    margin: 0;
  }

  .array-add {
    display: flex;
    gap: 0.375rem;
  }

  .array-input {
    flex: 1;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
  }

  .array-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .array-add-btn {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--color-accent);
    border-radius: 0.375rem;
    background: var(--color-accent);
    color: white;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .array-add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .array-add-btn:not(:disabled):hover {
    background: var(--color-accent-hover);
  }
</style>
