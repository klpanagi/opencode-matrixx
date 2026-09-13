<script lang="ts">
  import { uiStore, SECTIONS } from "$lib/store/ui-store"
  import type { SectionId } from "$lib/types"

  let activeSection = $state<SectionId>("dashboard")
  uiStore.activeSection.subscribe((v) => (activeSection = v))

  const SECTION_ICONS: Record<string, string> = {
    dashboard: "◉",
    core: "⚙",
    agents: "◆",
    categories: "⊞",
    tiers: "⊟",
    skills: "⚡",
  }

  function isActive(id: SectionId): boolean {
    return activeSection === id
  }

  function navigate(id: SectionId) {
    uiStore.navigate(id)
  }
</script>

<aside class="sidebar" role="navigation" aria-label="Configuration sections">
  <div class="sidebar-header">
    <span class="sidebar-brand">Matrixx Config</span>
    <span class="sidebar-version">v2.6.4</span>
  </div>

  <div class="sidebar-search">
    <input
      type="search"
      class="search-input"
      placeholder="Search sections..."
      aria-label="Search sections"
      bind:value={uiStore.searchQuery}
    />
  </div>

  <nav class="sidebar-nav">
    {#each SECTIONS as section}
      <button
        class="nav-item"
        class:nav-item--active={isActive(section.id)}
        onclick={() => navigate(section.id)}
        aria-current={isActive(section.id) ? "page" : undefined}
      >
        <span class="nav-icon">{SECTION_ICONS[section.id] ?? "○"}</span>
        <span class="nav-label">{section.label}</span>
      </button>
    {/each}
  </nav>
</aside>

<style>
  .sidebar {
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100vh;
  }

  .sidebar-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .sidebar-brand {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .sidebar-version {
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
    font-family: monospace;
  }

  .sidebar-search {
    padding: 0.75rem;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-bg);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
    box-sizing: border-box;
  }

  .search-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .sidebar-nav {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    background: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    transition: background 0.12s, color 0.12s;
  }

  .nav-item:hover {
    background: oklch(0.94 0.02 265 / 0.4);
    color: var(--color-text-primary);
  }

  .nav-item:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .nav-item--active {
    background: oklch(0.55 0.18 265 / 0.1);
    color: var(--color-accent);
    font-weight: 500;
  }

  .nav-icon {
    font-size: 0.9375rem;
    width: 1.25rem;
    text-align: center;
    flex-shrink: 0;
  }

  .nav-label {
    flex: 1;
  }
</style>
