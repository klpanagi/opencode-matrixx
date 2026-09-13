<script lang="ts">
  let {
    label,
    description = "",
    advanced = false,
    children,
  }: {
    label: string
    description?: string
    advanced?: boolean
    children?: import("svelte").Snippet
  } = $props()

  let expanded = $state(!advanced)
</script>

<div
  class="field-editor {advanced ? 'field-editor--advanced' : ''}"
  role="group"
  aria-labelledby={label.replace(/\s+/g, "-").toLowerCase()}
>
  <div class="field-header">
    <label class="field-label" id={label.replace(/\s+/g, "-").toLowerCase()}>
      {label}
      {#if advanced}
        <span class="badge-advanced">Advanced</span>
      {/if}
    </label>
    {#if advanced}
      <button
        class="toggle-btn"
        onclick={() => (expanded = !expanded)}
        aria-expanded={expanded}
        aria-controls="advanced-content"
      >
        {expanded ? "Hide" : "Show"}
      </button>
    {/if}
  </div>

  {#if description}
    <p class="field-description">{description}</p>
  {/if}

  {#if !advanced || expanded}
    <div id="advanced-content" class="field-content">
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
  .field-editor {
    margin-bottom: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    transition: border-color 0.15s;
  }

  .field-editor:focus-within {
    border-color: var(--color-accent);
  }

  .field-editor--advanced {
    opacity: 0.85;
  }

  .field-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-advanced {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: oklch(0.93 0.03 80);
    color: oklch(0.5 0.12 80);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .toggle-btn {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--color-accent);
    cursor: pointer;
    transition: background 0.15s;
  }

  .toggle-btn:hover {
    background: oklch(0.93 0.05 265 / 0.3);
  }

  .field-description {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0.375rem 0 0;
    line-height: 1.4;
  }

  .field-content {
    margin-top: 0.5rem;
  }
</style>
