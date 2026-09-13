<script lang="ts">
  import { PRESET_METAS, type PresetMeta, type PresetName } from "$lib/presets/presets"
  import { configStore } from "$lib/store/config-store"
  import { notificationStore } from "$lib/store/notification-store"

  let selected = $state<PresetName | null>(null)
  let applying = $state(false)

  function applyPreset(meta: PresetMeta) {
    selected = meta.name
    applying = true
    // Simulate brief async apply
    setTimeout(() => {
      configStore.applyPreset(meta.name)
      applying = false
      notificationStore.success(`Applied "${meta.label}" preset`)
    }, 200)
  }
</script>

<div class="preset-selector" role="radiogroup" aria-label="Configuration presets">
  <h2 class="preset-heading">Presets</h2>
  <p class="preset-subtitle">Start from a preset and customize from there</p>
  <div class="preset-grid">
    {#each PRESET_METAS as meta}
      <button
        class="preset-card"
        class:preset-card--active={selected === meta.name}
        class:preset-card--applying={applying && selected === meta.name}
        onclick={() => applyPreset(meta)}
        role="radio"
        aria-checked={selected === meta.name}
        aria-label={`Apply ${meta.label} preset: ${meta.description}`}
        disabled={applying}
      >
        <div class="preset-card-header">
          <span class="preset-name">{meta.label}</span>
          <span class="preset-tier">{meta.tier}</span>
        </div>
        <p class="preset-desc">{meta.description}</p>
      </button>
    {/each}
  </div>
</div>

<style>
  .preset-selector {
    margin-bottom: 2rem;
  }

  .preset-heading {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 0.25rem;
  }

  .preset-subtitle {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 0.75rem;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.625rem;
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    padding: 0.875rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: var(--color-surface);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s, box-shadow 0.15s;
    font-family: inherit;
    color: inherit;
    width: 100%;
  }

  .preset-card:hover:not(:disabled) {
    border-color: var(--color-accent);
    box-shadow: 0 1px 4px oklch(0.55 0.18 265 / 0.12);
  }

  .preset-card:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .preset-card--active {
    border-color: var(--color-accent);
    background: oklch(0.93 0.05 265 / 0.15);
  }

  .preset-card:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .preset-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.375rem;
  }

  .preset-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .preset-tier {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: oklch(0.55 0.18 265 / 0.1);
    color: var(--color-accent);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .preset-desc {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.4;
  }
</style>
