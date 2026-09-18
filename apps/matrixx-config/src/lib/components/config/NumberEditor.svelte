<script lang="ts">
  let {
    value = 0,
    onChange,
    label,
    min = 0,
    max = 2,
    step = 0.1,
    showSlider = false,
  }: {
    value?: number
    onChange?: (v: number) => void
    label: string
    min?: number
    max?: number
    step?: number
    showSlider?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally (intentional: local draft synced back via $effect)
  let numValue = $state(value ?? 0)

  $effect(() => {
    numValue = value ?? 0
  })

  function handleInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const v = parseFloat(target.value)
    if (!isNaN(v) && v >= min && v <= max) {
      numValue = v
      onChange?.(v)
    }
  }

  function handleSlider(e: Event) {
    const target = e.currentTarget as HTMLInputElement
    const v = parseFloat(target.value)
    numValue = v
    onChange?.(v)
  }

  const sliderSteps = $derived(Math.round((max - min) / step))
</script>

<div class="number-editor">
  <div class="number-input-group">
    <input
      type="number"
      value={numValue}
      oninput={handleInput}
      min={min}
      max={max}
      step={step}
      class="number-input"
      aria-label={label}
    />
  </div>
  {#if showSlider && sliderSteps > 0}
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={numValue}
      oninput={handleSlider}
      class="number-slider"
      aria-label={`${label} slider`}
    />
  {/if}
</div>

<style>
  .number-editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .number-input-group {
    display: flex;
    align-items: center;
  }

  .number-input {
    width: 5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: 0.8125rem;
    font-family: monospace;
    text-align: right;
  }

  .number-input:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  .number-slider {
    width: 100%;
    height: 4px;
    appearance: none;
    background: oklch(0.88 0 0);
    border-radius: 2px;
    cursor: pointer;
  }

  .number-slider::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-accent);
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .number-slider:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
