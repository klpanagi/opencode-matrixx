<script lang="ts">
  let {
    value = "",
    onChange,
    label,
    envHint = "",
  }: {
    value?: string
    onChange?: (v: string) => void
    label: string
    envHint?: string
  } = $props()

  let maskedValue = $state(value ?? "")
  let visible = $state(false)

  $effect(() => {
    maskedValue = value ?? ""
  })

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    maskedValue = target.value
    onChange?.(maskedValue)
  }

  function toggleVisibility() {
    visible = !visible
  }
</script>

<div class="secret-editor">
  <div class="secret-input-group">
    <input
      type={visible ? "text" : "password"}
      value={maskedValue}
      oninput={handleInput}
      class="secret-input"
      aria-label={label}
      autocomplete="off"
      spellcheck="false"
    />
    <button
      class="toggle-visibility"
      onclick={toggleVisibility}
      aria-label={visible ? "Hide value" : "Show value"}
      type="button"
    >
      {visible ? "Hide" : "Show"}
    </button>
  </div>
  {#if envHint}
    <p class="env-hint">
      <span class="env-label">ENV:</span> {envHint}
    </p>
  {/if}
</div>

<style>
  .secret-editor {
    width: 100%;
  }

  .secret-input-group {
    display: flex;
    gap: 0.375rem;
  }

  .secret-input {
    flex: 1;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
    font-family: monospace;
  }

  .secret-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .toggle-visibility {
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .toggle-visibility:hover {
    background: oklch(0.95 0 0);
  }

  .env-hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin: 0.375rem 0 0;
    font-family: monospace;
  }

  .env-label {
    font-weight: 600;
    color: oklch(0.5 0.1 80);
  }
</style>
