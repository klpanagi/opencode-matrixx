import { z } from "zod"

const HookNameEnum = z.enum([
  "task-continuation-enforcer",
  "context-window-monitor",
  "session-recovery",
  "session-notification",
  "comment-checker",
  "tool-output-truncator",
  "directory-agents-injector",
  "empty-task-response-detector",
  "think-mode",
  "context-window-limit-recovery",
  "preemptive-compaction",
  "rules-injector",
  "background-notification",
  "background-task-blocker",
  "auto-update-checker",
  "startup-toast",
  "keyword-detector",
  "agent-usage-reminder",
  "non-interactive-env",
  "interactive-bash-session",

  "thinking-block-validator",
  "matrix-loop",
  "category-skill-reminder",

  "compaction-context-injector",
  "auto-slash-command",
  "edit-error-recovery",
  "delegate-task-retry",
  "oracle-md-only",
  "plan-persister",
	"mouse-notepad",
  "start-work",
  "architect",
  "unstable-agent-babysitter",
  "task-resume-info",
  "stop-continuation-guard",
  "write-existing-file-guard",
  "anthropic-effort",
  "hashline-read-enhancer",
  "secret-leak-guard",
  "input-secret-guard",
  "env-context-injector",
  "env-file-write-guard",
  "json-error-recovery",
  "bash-file-read-guard",
  "runtime-fallback",
  "read-image-resizer",
  "webfetch-redirect-guard",
  "tool-pair-validator",
  "quality-gate",
  "design-intent-preserver",
  "rtk-bash-rewriter",
  "evolution-watcher",
  "evolution-compressor",
  "evolution-hitl",
  "context-mode-enforcer",
  "task-edit-guard",
  "document-reader-guard",
  "knowledge-hub-guard",
  "knowledge-hub-injector",
  "knowledge-hub-search-nudge",
  "dcp-nudge-sanitizer",
  "nudge-loop-breaker",
])

// Deprecated alias — remove in v2.7 (BREAKING: rename anthropic- → generic)
//
// The 4 literals below belong to the removed legacy todo system. Their hooks no
// longer exist, but the NAMES stay parseable so a config written before the
// removal keeps loading without an `invalid_enum` error. They are deliberately
// NOT mapped onto a live hook (no rename target) and NOT `.transform()`ed — see
// `HOOK_NAME_MAP` in `src/shared/migration/hook-names.ts`, which strips them
// from the effective `disabled_hooks` with one warn.
export const HookNameSchema = z.union([
  HookNameEnum,
  z.literal("anthropic-context-window-limit-recovery").transform(() => 'context-window-limit-recovery' as const),
  /** @deprecated no-op since v2.7 — hook removed, name retained so existing configs keep loading. Remove in v3.0. */
  z.literal("todo-continuation-enforcer"),
  /** @deprecated no-op since v2.7 — hook removed, name retained so existing configs keep loading. Remove in v3.0. */
  z.literal("compaction-todo-preserver"),
  /** @deprecated no-op since v2.7 — hook removed, name retained so existing configs keep loading. Remove in v3.0. */
  z.literal("tasks-todowrite-disabler"),
  /** @deprecated no-op since v2.7 — hook removed, name retained so existing configs keep loading. Remove in v3.0. */
  z.literal("task-notepad"),
])

export type HookName = z.infer<typeof HookNameSchema>

