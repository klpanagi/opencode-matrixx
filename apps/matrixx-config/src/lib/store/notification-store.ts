import { writable, type Writable } from "svelte/store";
import type { Toast } from "$lib/types";

function createNotificationStore() {
  const toasts: Writable<Toast[]> = writable([]);

  let counter = 0;

  function add(
    message: string,
    type: Toast["type"] = "info",
    duration = 4000,
  ): string {
    const id = `toast-${++counter}-${Date.now()}`;
    toasts.update((t) => [...t, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => remove(id), duration);
    }

    return id;
  }

  function remove(id: string): void {
    toasts.update((t) => t.filter((toast) => toast.id !== id));
  }

  function success(message: string, duration?: number): string {
    return add(message, "success", duration);
  }

  function error(message: string, duration?: number): string {
    return add(message, "error", duration ?? 6000);
  }

  function info(message: string, duration?: number): string {
    return add(message, "info", duration);
  }

  function warning(message: string, duration?: number): string {
    return add(message, "warning", duration ?? 5000);
  }

  function clear(): void {
    toasts.set([]);
  }

  return {
    toasts,
    add,
    remove,
    success,
    error,
    info,
    warning,
    clear,
  };
}

export const notificationStore = createNotificationStore();
