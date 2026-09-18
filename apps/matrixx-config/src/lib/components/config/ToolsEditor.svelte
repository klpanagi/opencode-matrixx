<script lang="ts">
  import EnumEditor from "$lib/components/config/EnumEditor.svelte"
  import StringEditor from "$lib/components/config/StringEditor.svelte"

  let {
    value,
    onChange,
    label,
  }: {
    value?: Record<string, boolean>
    onChange?: (v: Record<string, boolean> | undefined) => void
    label: string
  } = $props()

  // svelte-ignore state_referenced_locally (intentional: local draft synced back via $effect)
  let entries = $state<Array<{ key: string; val: boolean }>>(
    Object.entries(value ?? {}).map(([key, val]) => ({ key, val })),
  )
  let newKey = $state("")

  $effect(() => {
    entries = Object.entries(value ?? {}).map(([key, val]) => ({ key, val }))
  })

  function emit(next: Array<{ key: string; val: boolean }>) {
    entries = next
    const obj: Record<string, boolean> = {}
    for (const e of next) if (e.key.trim()) obj[e.key.trim()] = e.val
    onChange?.(Object.keys(obj).length > 0 ? obj : undefined)
  }

  function add() {
    const k = newKey.trim()
    if (!k || entries.some((e) => e.key === k)) return
    emit([...entries, { key: k, val: true }])
    newKey = ""
  }
</script>

<div class="tools-editor" role="group" aria-label={label}>
  {#if entries.length === 0}
    <p class="tools-empty">No tool overrides — all tools inherit defaults.</p>
  {/if}
  {#each entries as e, i}
    <div class="tools-row">
      <span class="tools-key">{e.key}</span>
      <EnumEditor
        value={e.val ? "true" : "false"}
        options={[
          { value: "true", label: "Enabled" },
          { value: "false", label: "Disabled" },
        ]}
        onChange={(v) => {
          const next = [...entries]
          next[i] = { ...e, val: v === "true" }
          emit(next)
        }}
        label={`${e.key} enabled`}
        placeholder="—"
      />
      <button
        class="tools-remove"
        type="button"
        onclick={() => emit(entries.filter((_, j) => j !== i))}
        aria-label={`Remove ${e.key}`}
      >
        ×
      </button>
    </div>
  {/each}
  <div class="tools-add">
    <StringEditor
      value={newKey}
      onChange={(v) => (newKey = v)}
      label="New tool name"
      placeholder="Tool name…"
      monospace
    />
    <button class="tools-add-btn" type="button" onclick={add} disabled={!newKey.trim()}>
      Add
    </button>
  </div>
</div>

<style>
  .tools-editor {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .tools-empty {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0;
  }
  .tools-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .tools-key {
    font-family: monospace;
    font-size: 0.8125rem;
    min-width: 8rem;
  }
  .tools-remove {
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    font-size: 1rem;
  }
  .tools-add {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .tools-add-btn {
    font-size: 0.8125rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    cursor: pointer;
  }
</style>
