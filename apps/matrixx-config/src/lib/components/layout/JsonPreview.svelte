<script lang="ts">
  import { configStore } from "$lib/store/config-store"

  let jsonPreview = $state("")
  let expanded = $state(false)

  configStore.jsonPreview.subscribe((v) => (jsonPreview = v))

  function copyJson() {
    navigator.clipboard?.writeText(jsonPreview).catch(() => {})
  }
</script>

<div class="json-preview">
  <button
    class="json-toggle"
    onclick={() => (expanded = !expanded)}
    aria-expanded={expanded}
    aria-controls="json-preview-content"
  >
    <span class="json-toggle-label">
      {expanded ? "Hide" : "Show"} JSON Preview
    </span>
    <span class="json-toggle-icon">{expanded ? "▲" : "▼"}</span>
  </button>

  {#if expanded}
    <div id="json-preview-content" class="json-content">
      <div class="json-toolbar">
        <button class="json-copy-btn" onclick={copyJson}>Copy</button>
      </div>
      <pre class="json-code"><code>{jsonPreview}</code></pre>
    </div>
  {/if}
</div>

<style>
  .json-preview {
    margin-top: 2rem;
    max-width: 48rem;
  }

  .json-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    transition: background 0.12s;
  }

  .json-toggle:hover {
    background: oklch(0.96 0 0);
  }

  .json-toggle:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .json-content {
    margin-top: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .json-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 0.375rem 0.5rem;
    background: oklch(0.96 0 0);
    border-bottom: 1px solid var(--color-border);
  }

  .json-copy-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .json-copy-btn:hover {
    background: oklch(0.93 0 0);
  }

  .json-code {
    padding: 0.75rem;
    margin: 0;
    font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--color-text-primary);
    overflow-x: auto;
    max-height: 20rem;
    overflow-y: auto;
    white-space: pre;
    background: oklch(0.98 0 0);
  }
</style>
