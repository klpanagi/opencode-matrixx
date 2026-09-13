<script lang="ts">
  import { configStore } from "$lib/store/config-store"

  const TIER_INFO = [
    {
      name: "free",
      label: "Free",
      description: "Cost-effective models for simple tasks. Best for non-critical operations and experimentation.",
      color: "oklch(0.6 0.1 160)",
    },
    {
      name: "fast",
      label: "Fast",
      description: "Quick-response models optimized for speed. Ideal for high-volume, low-latency operations.",
      color: "oklch(0.65 0.15 200)",
    },
    {
      name: "standard",
      label: "Standard",
      description: "Balanced quality and speed. The default for most operations.",
      color: "oklch(0.6 0.12 240)",
    },
    {
      name: "premium",
      label: "Premium",
      description: "High-quality models for complex reasoning. Used by core agents like Morpheus and Oracle.",
      color: "oklch(0.55 0.18 265)",
    },
    {
      name: "frontier",
      label: "Frontier",
      description: "Cutting-edge models for maximum capability. Highest cost, best quality.",
      color: "oklch(0.55 0.2 300)",
    },
  ]

  let config = $state(configStore.getSnapshot())
  configStore.subscribe((v) => (config = v))

  let defaultTier = $derived(config.default_tier ?? "standard")
</script>

<div class="section">
  <h2 class="section-title">Tiers</h2>
  <p class="section-desc">
    Tiers resolve to concrete models at config-load time. Current default:
    <strong class="default-tier">{defaultTier}</strong>
  </p>

  <div class="tier-grid">
    {#each TIER_INFO as tier}
      <div class="tier-card" style="--tier-color: {tier.color}">
        <div class="tier-indicator" style="background: {tier.color}"></div>
        <div class="tier-content">
          <h3 class="tier-name">{tier.label}</h3>
          <p class="tier-desc">{tier.description}</p>
        </div>
      </div>
    {/each}
  </div>

  <div class="note">
    <p>Tier definitions are resolved by your OpenCode provider list. Configure custom tiers via the <code>tiers</code> field in your matrixx.jsonc.</p>
  </div>
</div>

<style>
  .section { max-width: 48rem; }

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

  .default-tier {
    color: var(--color-accent);
    text-transform: capitalize;
  }

  .tier-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }

  .tier-card {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: var(--color-surface);
  }

  .tier-indicator {
    width: 4px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .tier-content {
    flex: 1;
  }

  .tier-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 0.375rem;
  }

  .tier-desc {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .note {
    margin-top: 2rem;
    padding: 0.75rem 1rem;
    background: oklch(0.96 0.02 240 / 0.3);
    border: 1px solid oklch(0.9 0.03 240 / 0.3);
    border-radius: 0.5rem;
  }

  .note p {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .note code {
    font-size: 0.78125rem;
    background: oklch(0.93 0 0);
    padding: 0.125rem 0.3125rem;
    border-radius: 0.25rem;
  }
</style>
