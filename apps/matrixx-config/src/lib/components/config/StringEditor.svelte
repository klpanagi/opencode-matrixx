<script lang="ts">
  let {
    value = "",
    onChange,
    label,
    placeholder = "",
    multiline = false,
    monospace = false,
  }: {
    value?: string
    onChange?: (v: string) => void
    label: string
    placeholder?: string
    multiline?: boolean
    monospace?: boolean
  } = $props()

  let textValue = $state(value ?? "")

  $effect(() => {
    textValue = value ?? ""
  })

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement | HTMLTextAreaElement
    textValue = target.value
    onChange?.(textValue)
  }
</script>

<div class="string-editor">
  {#if multiline}
    <textarea
      class="string-input string-input--multiline {monospace ? 'string-input--mono' : ''}"
      value={textValue}
      oninput={handleInput}
      placeholder={placeholder}
      aria-label={label}
      rows="3"
    />
  {:else}
    <input
      type="text"
      class="string-input {monospace ? 'string-input--mono' : ''}"
      value={textValue}
      oninput={handleInput}
      placeholder={placeholder}
      aria-label={label}
    />
  {/if}
</div>

<style>
  .string-editor {
    width: 100%;
  }

  .string-input {
    width: 100%;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
    line-height: 1.5;
    transition: border-color 0.15s;
  }

  .string-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .string-input--mono {
    font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
    font-size: 0.78125rem;
  }

  .string-input--multiline {
    resize: vertical;
    min-height: 4rem;
  }
</style>
