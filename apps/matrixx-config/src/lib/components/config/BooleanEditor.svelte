<script lang="ts">
  let {
    value = false,
    onChange,
    label,
  }: {
    value?: boolean
    onChange?: (v: boolean) => void
    label: string
  } = $props()

  function toggle() {
    onChange?.(!value)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      toggle()
    }
  }
</script>

<div class="boolean-editor">
  <button
    class="toggle-track"
    role="switch"
    aria-checked={!!value}
    aria-label={label}
    onclick={toggle}
    onkeydown={handleKeydown}
    class:toggle-track--active={!!value}
  >
    <span class="toggle-thumb" class:toggle-thumb--active={!!value}></span>
  </button>
  <span class="toggle-value">{value ? "Enabled" : "Disabled"}</span>
</div>

<style>
  .boolean-editor {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .toggle-track {
    width: 2.5rem;
    height: 1.375rem;
    border-radius: 0.6875rem;
    border: 2px solid var(--color-border);
    background: oklch(0.9 0 0);
    cursor: pointer;
    position: relative;
    transition: background 0.2s, border-color 0.2s;
    padding: 0;
  }

  .toggle-track:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

  .toggle-track--active {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .toggle-thumb {
    position: absolute;
    top: 0.125rem;
    left: 0.125rem;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .toggle-thumb--active {
    transform: translateX(1.125rem);
  }

  .toggle-value {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
  }
</style>
