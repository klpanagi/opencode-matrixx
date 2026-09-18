<script lang="ts">
  import { notificationStore } from "$lib/store/notification-store"

  let toasts = $state([] as Array<{ id: string; message: string; type: string }>)
  notificationStore.toasts.subscribe((v) => (toasts = v))

  function remove(id: string) {
    notificationStore.remove(id)
  }

  function typeClass(type: string): string {
    return `toast toast--${type}`
  }
</script>

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite" aria-label="Notifications">
    {#each toasts as toast (toast.id)}
      <div class={typeClass(toast.type)} role="alert">
        <span class="toast-icon">
          {#if toast.type === "success"}✓
          {:else if toast.type === "error"}✕
          {:else if toast.type === "warning"}⚠
          {:else}ℹ
          {/if}
        </span>
        <span class="toast-message">{toast.message}</span>
        <button
          class="toast-close"
          onclick={() => remove(toast.id)}
          aria-label="Dismiss notification"
        >&times;</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 1000;
    max-width: 24rem;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    font-size: 0.875rem;
    animation: slideIn 0.2s ease-out;
  }

  .toast--success { border-left: 3px solid oklch(0.6 0.15 150); }
  .toast--error { border-left: 3px solid oklch(0.55 0.2 25); }
  .toast--warning { border-left: 3px solid oklch(0.65 0.15 80); }
  .toast--info { border-left: 3px solid var(--color-accent); }

  .toast-icon { font-size: 1rem; flex-shrink: 0; }
  .toast--success .toast-icon { color: oklch(0.6 0.15 150); }
  .toast--error .toast-icon { color: oklch(0.55 0.2 25); }
  .toast--warning .toast-icon { color: oklch(0.65 0.15 80); }
  .toast--info .toast-icon { color: var(--color-accent); }

  .toast-message { flex: 1; color: var(--color-text-primary); }

  .toast-close {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 1.125rem;
    line-height: 1;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>
