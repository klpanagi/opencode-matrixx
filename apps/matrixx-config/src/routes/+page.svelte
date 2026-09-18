<script lang="ts">
  import { uiStore } from "$lib/store/ui-store"
  import { configStore } from "$lib/store/config-store"
  import { notificationStore } from "$lib/store/notification-store"
  import type { SectionId } from "$lib/types"
  import PresetSelector from "$lib/components/presets/PresetSelector.svelte"
  import JsonPreview from "$lib/components/layout/JsonPreview.svelte"
  import CoreSection from "$lib/components/sections/CoreSection.svelte"
  import ModelsSection from "$lib/components/sections/ModelsSection.svelte"
  import AgentsSection from "$lib/components/sections/AgentsSection.svelte"
  import CategoriesSection from "$lib/components/sections/CategoriesSection.svelte"
  import TasksSection from "$lib/components/sections/TasksSection.svelte"
  import FeaturesSection from "$lib/components/sections/FeaturesSection.svelte"
  import BackgroundSection from "$lib/components/sections/BackgroundSection.svelte"
  import SecuritySection from "$lib/components/sections/SecuritySection.svelte"
  import DcpSection from "$lib/components/sections/DcpSection.svelte"
  import KnowledgeSection from "$lib/components/sections/KnowledgeSection.svelte"
  import AdvancedSection from "$lib/components/sections/AdvancedSection.svelte"

  let activeSection = $state<SectionId>("dashboard")
  let saving = $state(false)
  let dirty = $state(false)

  uiStore.activeSection.subscribe((v) => (activeSection = v))
  configStore.saving.subscribe((v) => (saving = v))
  configStore.dirty.subscribe((v) => (dirty = v))

  async function handleSave() {
    await configStore.save()
    notificationStore.success("Configuration saved")
  }

  function handleReset() {
    configStore.reset()
    notificationStore.info("Configuration reset to defaults")
  }
</script>

<div class="page">
  {#if activeSection === "dashboard"}
    <div class="dashboard">
      <header class="dashboard-header">
        <h1>Matrixx Configuration Studio</h1>
        <p class="subtitle">Graphical interface for Matrixx &amp; OpenCode configuration</p>
      </header>

      <PresetSelector />

      <section class="info-cards">
        <div class="card">
          <h2>Config Files</h2>
          <p>Manage your <code>matrixx.jsonc</code> configuration through an intuitive interface.</p>
        </div>
        <div class="card">
          <h2>Live Validation</h2>
          <p>Every change is validated against the Matrixx Zod schema — catch errors before they reach your config.</p>
        </div>
        <div class="card">
          <h2>Presets</h2>
          <p>Start from a preset (Minimal, Balanced, Performance, Frontier) and customize from there.</p>
        </div>
      </section>

      <JsonPreview />
    </div>

  {:else if activeSection === "core"}
    <CoreSection />
  {:else if activeSection === "models"}
    <ModelsSection />
  {:else if activeSection === "agents"}
    <AgentsSection />
  {:else if activeSection === "categories"}
    <CategoriesSection />
  {:else if activeSection === "tasks"}
    <TasksSection />
  {:else if activeSection === "features"}
    <FeaturesSection />
  {:else if activeSection === "background"}
    <BackgroundSection />
  {:else if activeSection === "security"}
    <SecuritySection />
  {:else if activeSection === "dcp"}
    <DcpSection />
  {:else if activeSection === "knowledge"}
    <KnowledgeSection />
  {:else if activeSection === "advanced"}
    <AdvancedSection />
  {/if}

  {#if activeSection !== "dashboard"}
    <div class="action-bar">
      {#if dirty}
        <span class="unsaved-badge" role="status">Unsaved changes</span>
      {/if}
      <div class="action-buttons">
        <button class="btn btn--secondary" onclick={handleReset} disabled={!dirty}>
          Reset
        </button>
        <button
          class="btn btn--primary"
          onclick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>

    <JsonPreview />
  {/if}
</div>

<style>
  .page {
    max-width: 64rem;
  }

  .dashboard-header {
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 0.375rem;
  }

  .subtitle {
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    margin: 0;
  }

  .info-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 1.25rem;
  }

  .card h2 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
    color: var(--color-text-primary);
  }

  .card p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .card code {
    font-size: 0.8125rem;
    background: oklch(0.96 0 0);
    padding: 0.125rem 0.3125rem;
    border-radius: 0.25rem;
  }

  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2rem;
    padding: 0.75rem 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
  }

  .unsaved-badge {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background: oklch(0.92 0.08 50 / 0.3);
    color: oklch(0.5 0.15 50);
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--color-border);
    font-family: inherit;
    transition: background 0.12s, opacity 0.12s;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn--primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .btn--primary:not(:disabled):hover {
    background: var(--color-accent-hover);
  }

  .btn--secondary {
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }

  .btn--secondary:not(:disabled):hover {
    background: oklch(0.95 0 0);
  }
</style>
