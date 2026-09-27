import type { MatrixxConfig } from "../config/schema"
import type { TasksConfig } from "../config/schema/tasks"
import { warn } from "./logger"

export const TASK_SYSTEM_DEFAULT = true as const

export type ResolvedTasksConfig = Required<
  Pick<TasksConfig, "enabled" | "scope" | "session_scoped">
> &
  Pick<
    TasksConfig,
    | "storage_path"
    | "task_list_id"
    | "stale_after_hours"
    | "pollTimeoutMs"
    | "background_stale_after_hours"
  >

const LOG_MARKER = "[task-system-legacy-keys]"

/**
 * Fallback for `tasks.background_stale_after_hours` when the key is absent.
 * Kept here, next to the resolution that applies it, so the default and its
 * use site cannot drift; re-exported from the enforcer's `staleness.ts` where
 * the other staleness default lives.
 */
export const DEFAULT_BACKGROUND_STALE_AFTER_HOURS = 2

const LOUD_WARNING =
  "tasks.enabled=false was working until this release and is now ignored: " +
  "the file-backed task system is unconditional, so this setting has no " +
  "effect at all. Remove `tasks.enabled` from your matrixx.json."

const EXPERIMENTAL_WARNING =
  "experimental.task_system is now ignored. It used to toggle the removed " +
  "legacy todo system. Remove it from your matrixx.json."

const NEW_TASK_SYSTEM_WARNING =
  "new_task_system_enabled is now ignored. It is the oldest alias of the " +
  "removed legacy todo system toggle. Remove it from your matrixx.json."

interface ToastClient {
  tui?: {
    showToast?: (input: unknown) => Promise<unknown>;
  };
}

let toastSink: ((message: string) => void) | undefined;
let hasWarnedAboutLegacyKeys = false;

function isToastClient(value: unknown): value is ToastClient {
  return typeof value === "object" && value !== null;
}

/**
 * Point the one-time deprecation toast at an OpenCode client. Pass
 * `undefined` to detach. Failures are swallowed — a toast is never worth a
 * broken config load.
 */
export function bindTaskSystemDeprecationToast(client: unknown): void {
  if (!isToastClient(client) || typeof client.tui?.showToast !== "function") {
    toastSink = undefined;
    return;
  }
  const tui = client.tui;
  toastSink = (message: string) => {
    void tui.showToast
      ?.call(tui, {
        body: {
          title: "Matrixx config deprecation",
          message,
          variant: "warning",
          duration: 10000,
        },
      })
      .catch(() => undefined);
  };
}

/** Test-only: allow the one-time warning to fire again. */
export function resetTaskSystemDeprecationWarning(): void {
  hasWarnedAboutLegacyKeys = false;
}

function collectLegacyKeyWarnings(
  config: Partial<MatrixxConfig> | undefined | null,
): string[] {
  const messages: string[] = [];
  if (config?.tasks?.enabled === false) messages.push(LOUD_WARNING);
  if (config?.experimental?.task_system === false)
    messages.push(EXPERIMENTAL_WARNING);
  if (config?.new_task_system_enabled === false)
    messages.push(NEW_TASK_SYSTEM_WARNING);
  return messages;
}

function warnAboutLegacyKeys(
  config: Partial<MatrixxConfig> | undefined | null,
): void {
  if (hasWarnedAboutLegacyKeys) return;
  const messages = collectLegacyKeyWarnings(config);
  if (messages.length === 0) return;
  hasWarnedAboutLegacyKeys = true;
  for (const message of messages) warn(`${LOG_MARKER} ${message}`);
  toastSink?.(messages.join("\n\n"));
}

/**
 * Merge the canonical `tasks` section with the remaining legacy locations:
 * `morpheus.tasks.*` → same-named key, `task.pollTimeoutMs` → pollTimeoutMs.
 *
 * `enabled` is NOT derived from the config: the file-backed task system is
 * unconditional and always resolves to `TASK_SYSTEM_DEFAULT`. The three keys
 * that used to gate it (`tasks.enabled`, `experimental.task_system`,
 * `new_task_system_enabled`) are parsed, ignored, and reported once per session
 * via `warn` plus a single startup toast. Nothing here throws.
 *
 * Pure derivation, no mutation — safe to call on every read.
 */
export function resolveTasksConfig(
  config: Partial<MatrixxConfig> | undefined | null,
): ResolvedTasksConfig {
  warnAboutLegacyKeys(config);
  const canonical = config?.tasks;
  const legacyTasks = config?.morpheus?.tasks;
  const legacyPoll = config?.task?.pollTimeoutMs;
  return {
    enabled: TASK_SYSTEM_DEFAULT,

    scope: canonical?.scope ?? legacyTasks?.scope ?? "project",
    storage_path: canonical?.storage_path ?? legacyTasks?.storage_path,
    task_list_id: canonical?.task_list_id ?? legacyTasks?.task_list_id,
    stale_after_hours:
      canonical?.stale_after_hours ?? legacyTasks?.stale_after_hours,
    // Canonical only: `background_stale_after_hours` is new, so it has no
    // legacy spelling to mirror. A second spelling for a key introduced in
    // the same release is a trap, not a compatibility path.
    background_stale_after_hours:
      canonical?.background_stale_after_hours ?? DEFAULT_BACKGROUND_STALE_AFTER_HOURS,
    session_scoped:
      canonical?.session_scoped ?? legacyTasks?.session_scoped ?? true,
    pollTimeoutMs: canonical?.pollTimeoutMs ?? legacyPoll,
  }
}

export function isTaskSystemEnabled(
  config: Partial<MatrixxConfig> | undefined | null,
): boolean {
  return resolveTasksConfig(config).enabled
}
