<script lang="ts">
  import type { FallbackChainEntry } from "$lib/types"
  import StringEditor from "$lib/components/config/StringEditor.svelte"
  import ArrayEditor from "$lib/components/config/ArrayEditor.svelte"

  let {
    value,
    onChange,
  }: {
    value?: FallbackChainEntry[]
    onChange?: (v: FallbackChainEntry[] | undefined) => void
  } = $props()

  function updateAt(i: number, patch: Partial<FallbackChainEntry>) {
    const next = [...(value ?? [])]
    const current: FallbackChainEntry = next[i] ?? { providers: [], model: "" }
    const merged: FallbackChainEntry = {
      providers: "providers" in patch ? (patch.providers ?? []) : current.providers,
      model: "model" in patch ? (patch.model ?? "") : current.model,
      variant: "variant" in patch ? patch.variant : current.variant,
    }
    next[i] = merged
    onChange?.(next.length > 0 ? next : undefined)
  }

  function removeAt(i: number) {
    const next = (value ?? []).filter((_, j) => j !== i)
    onChange?.(next.length > 0 ? next : undefined)
  }

  function add() {
    onChange?.([...(value ?? []), { providers: [], model: "" }])
  }
</script>

<div class="fb-chain">
  {#if !value || value.length === 0}
    <p class="fb-empty">No fallback chain — default resolution applies.</p>
  {/if}
  {#each value ?? [] as entry, i}
    <div class="fb-entry">
      <div class="fb-header">
        <span class="fb-index">#{i + 1}</span>
        <button class="fb-remove" type="button" onclick={() => removeAt(i)}>
          Remove
        </button>
      </div>
      <span class="fb-label">Providers (one per line via commas)</span>
      <ArrayEditor
        value={entry.providers ?? []}
        onChange={(v) => updateAt(i, { providers: v })}
        label={`Fallback ${i + 1} providers`}
        placeholder="provider…"
      />
      <span class="fb-label">Model</span>
      <StringEditor
        value={entry.model ?? ""}
        onChange={(v) => updateAt(i, { model: v })}
        label={`Fallback ${i + 1} model`}
        placeholder="provider/model"
        monospace
      />
      <span class="fb-label">Variant (optional)</span>
      <StringEditor
        value={entry.variant ?? ""}
        onChange={(v) => updateAt(i, { variant: v || undefined })}
        label={`Fallback ${i + 1} variant`}
        placeholder="variant…"
        monospace
      />
    </div>
  {/each}
  <button class="fb-add" type="button" onclick={add}>Add fallback entry</button>
</div>

<style>
  .fb-chain {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }
  .fb-empty {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0;
  }
  .fb-entry {
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    padding: 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .fb-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .fb-index {
    font-size: 0.75rem;
    font-weight: 600;
  }
  .fb-label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .fb-remove,
  .fb-add {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
    align-self: flex-start;
  }
</style>
