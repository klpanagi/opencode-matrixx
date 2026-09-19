# Matrixx Hooks Reference

> Source-verified reference for the matrixx hook system: what each hook does,
> when it runs, how to enable or disable it, and what it costs.
> Package version 2.6.10 (`package.json`). English only.
> Scope: `src/hooks/`, `src/create-hooks.ts`, `src/plugin/hooks/*`,
> `src/plugin-interface.ts`, `src/plugin/tool-execute-{before,after}.ts`,
> `src/config/schema/hooks.ts`, `src/index.ts`.

## 0. TL;DR

- `HookNameSchema` (`src/config/schema/hooks.ts`) holds 67 raw entries, 66 unique
  (`context-mode-enforcer` is listed twice) plus 1 deprecated alias
  (`anthropic-context-window-limit-recovery` maps to
  `context-window-limit-recovery`).
- `src/hooks/` holds 63 subdirectories (62 hook dirs + `shared/`) and 16 loose
  `.ts` files (5 `preemptive-compaction*`, 5 `session-notification*`, plus
  `bash-file-read-guard.ts`, `context-window-monitor.ts`,
  `empty-task-response-detector.ts`, `tool-output-truncator.ts`,
  `session-todo-status.ts`), plus `index.ts`, `AGENTS.md`.
- Every tool call passes through `tool.execute.before` (18 invocations over
  17 unique hooks in 3 waves, `src/plugin/tool-execute-before.ts`) **and**
  `tool.execute.after` (19 invocations, `src/plugin/tool-execute-after.ts`).
  That is why writes feel slow with matrixx enabled.
- Real-world cost sits in a few hooks, not in dispatch overhead: one
  subprocess (`secret-leak-guard` spawns `gitleaks`) and three SDK-HTTP hooks
  (`oracle-md-only`, `mouse-notepad`, `architect`), plus sequential `after`
  work (`quality-gate` Biome, `comment-checker` CLI).
- 8 registered hooks have factories but no call site in any current
  dispatcher (Section 2.4). They are constructed, appear in config, and cost
  nothing at runtime. `startup-toast` is a flag, not a factory.
- No per-hook wall-clock instrumentation exists today. Section 5 keeps a
  proposed timing protocol; the old bench file encodes a stale hook shape.
- Fastest fix for slow writes: the minimal-write profile (Section 3.3).

## 1. Architecture

### 1.1 Registration tiers (`src/create-hooks.ts`)

`createHooks()` merges three tiers. All factories live under
`src/plugin/hooks/`. The real files are `create-core-hooks.ts`,
`create-continuation-hooks.ts`, and `create-skill-hooks.ts`.

```text
createHooks()                       src/create-hooks.ts
+-- createCoreHooks()               src/plugin/hooks/create-core-hooks.ts
|   +-- createSessionHooks()        src/plugin/hooks/create-session-hooks.ts
|   +-- createToolGuardHooks()      src/plugin/hooks/create-tool-guard-hooks.ts
|   +-- createTransformHooks()      src/plugin/hooks/create-transform-hooks.ts
+-- createContinuationHooks()       src/plugin/hooks/create-continuation-hooks.ts
+-- createSkillHooks()              src/plugin/hooks/create-skill-hooks.ts
```

- Core/session builds prompt, guard, and lifecycle hooks (session recovery,
  compaction, oracle/mouse, matrix loop, notifications).
- Core/tool-guard builds the `tool.execute` hooks (guards, injectors,
  truncator, notepads).
- Core/transform builds message-shape hooks (secret guard, keyword detector,
  validators, design intent).
- Continuation builds 11 entries: stop guard, two compaction helpers, two
  enforcers (only one active at a time, gated by canonical `tasks.enabled`
  via `isTaskSystemEnabled`, with `experimental.task_system` as legacy fallback),
  babysitter, background notification, architect, plan persister, and two
  evolution hooks (only when `evolution.enabled` is true).
- Skill builds 2 entries: `category-skill-reminder`, `auto-slash-command`.

Every factory follows the safe-creation pattern
(`src/shared/safe-create-hook.ts`):

```ts
isHookEnabled("hook-name")
  ? safeCreateHook("hook-name", () => createXHook(ctx), { enabled: safeHookEnabled })
  : null;
```

`isHookEnabled` closes over a `disabled_hooks` set built once at plugin load
(`src/index.ts`). A `null` hook is skipped via optional chaining at dispatch.
`safe_hook_creation` (default true, `src/config/schema/experimental.ts:18`)
wraps factories in try/catch; `false` runs raw factories (faster startup,
louder failures).

### 1.2 OpenCode dispatch (`src/plugin-interface.ts`, `src/index.ts`)

`createPluginInterface()` (`src/plugin-interface.ts`) maps OpenCode events to
handlers; each handler fans out to hook methods:

| OpenCode event | Matrixx handler | Hooks attached |
|---|---|---|
| `tool.execute.before` | `createToolExecuteBeforeHandler` (`src/plugin/tool-execute-before.ts`) | 18 invocations, 3 waves (Section 1.3) |
| `tool.execute.after` | `createToolExecuteAfterHandler` (`src/plugin/tool-execute-after.ts`) | `toolOutputTruncator` + parallel `preemptiveCompaction`/`qualityGate` + 16 sequential (Section 1.4) |
| `chat.message` | `createChatMessageHandler` (`src/plugin/chat-message.ts`) | `inputSecretGuard`, `stopContinuationGuard`, `keywordDetector`, `autoSlashCommand`, `startWork` (conditional), `matrixLoop` template detection |
| `experimental.chat.messages.transform` | `createMessagesTransformHandler` (`src/plugin/messages-transform.ts`) | context-injector (always on, no disable key), `envContextInjector`, `thinkingBlockValidator`, `evolutionHitl` |
| `chat.params` | `createChatParamsHandler` (`src/plugin/chat-params.ts`) | `anthropicEffort` only, plus one-shot category temperature |
| `event` | `createEventHandler` (`src/plugin/event.ts`) | 19 dispatch lines: session, recovery, loop, guard, and injector hooks (Section 2.3) |
| `experimental.session.compacting` | inline in `src/index.ts` | `compactionTodoPreserver.capture`, `compactionContextInjector()`, `planPersister.buildRehydrationContext` |
| `tool.definition` / `config` | definition/config handlers | no hook logic today (`src/plugin/tool-definition.ts` is a pass-through) |

### 1.3 `tool.execute.before`: 3-wave pipeline

Source: `src/plugin/tool-execute-before.ts`. Hook references are bound once at
handler creation to skip per-call optional-chain cost. Waves run strictly in
order; hooks inside Wave 1 and Wave 2 run concurrently.

- Wave 1, READ_ONLY, `Promise.all` (4): `qualityGate`, `commentChecker`,
  `directoryAgentsInjector` (no-op in `before`), `rulesInjector` (no-op in
  `before`). Only private in-memory `Map` writes keyed by `callID`.
- Wave 2, BLOCKING, `Promise.all` fail-fast (8): `secretLeakGuard`,
  `envFileWriteGuard`, `writeExistingFileGuard`, `taskEditGuard`,
  `tasksTodowriteDisabler`, `oracleMdOnly` (blocking half),
  `contextModeEnforcer`, `backgroundTaskBlocker`. First rejection aborts the
  tool call. Each guard throws on a different condition for a different tool.
- Wave 3, MUTATOR, sequential (6): `rtkBashRewriter` (only when `rtk.enabled`)
  then `nonInteractiveEnv`, `bashFileReadGuard`, `oracleMdOnly` (mutator
  half), `mouseNotepad`, `architectHook`. Order matters: `nonInteractiveEnv`
  rewrites `output.args.command` first, and `architectHook` prepends outermost
  so its reminder sits closest to the model.

`oracleMdOnly` runs twice (once per Wave 2/3): 17 unique hooks,
18 invocations per tool call. The same handler also resolves `task`-tool
agent routing in parallel with Wave 3 and serves `/matrix-loop`,
`/stop-continuation`, `/assembly`, `/ultrawork` slash commands.

### 1.4 `tool.execute.after`: mostly sequential chain

Source: `src/plugin/tool-execute-after.ts`.

```text
toolOutputTruncator (always first)
+ Promise.all([
|     preemptiveCompaction (60s session.summarize timeout, parallel, never blocks),
|     qualityGate (Biome, parallel),
|     remainingHooks() sequential (16):
|       contextWindowMonitor -> commentChecker -> directoryAgentsInjector
|       -> rulesInjector -> emptyTaskResponseDetector -> agentUsageReminder
|       -> categorySkillReminder -> interactiveBashSession -> editErrorRecovery
|       -> delegateTaskRetry -> architectHook -> taskResumeInfo
|       -> hashlineReadEnhancer -> jsonErrorRecovery -> readImageResizer
|       -> taskNotepad
|   ])
```

Total: 19 invocations. `qualityGate`/`commentChecker` are cheap in `before`
(Map register) and expensive in `after` (Biome/CLI).
`directoryAgentsInjector`/`rulesInjector` are no-ops in `before` and do real
work in `after`.

## 2. Per-hook reference

Cost tiers: HOT-PATH (runs on every tool call, `before`), POST-TOOL (runs
after every tool call), SESSION (prompt, message, or lifecycle triggers
only). Class legend comes from
`src/plugin/hook-mutation-classification.md`: READ_ONLY (inspect only),
BLOCKING (may throw/abort), MUTATOR (rewrites `output.args`/`output.message`),
NETWORK (subprocess, SDK HTTP, or filesystem scan).

### 2.1 `tool.execute.before` hot path (17 hooks, 18 invocations)

| Hook | Class | Throws | I/O | Evidence | Tier |
|---|---|---|---|---|---|
| `secret-leak-guard` | BLOCKING+NETWORK | yes (`SECRET LEAK DETECTED`) | `Bun.spawn("gitleaks")` | `src/hooks/secret-leak-guard/hook.ts:20-60` | HOT-PATH, high (dominant) |
| `env-file-write-guard` | BLOCKING | yes (`SENSITIVE FILE GUARD`) | pure regex | `src/hooks/env-file-write-guard/hook.ts:18-48` | HOT-PATH, low |
| `write-existing-file-guard` | BLOCKING | yes (`File already exists`) | `existsSync` | `src/hooks/write-existing-file-guard/hook.ts:10-48` | HOT-PATH, low (one stat) |
| `task-edit-guard` | BLOCKING | yes (plan/task write warnings) | regex on tool + path | `src/hooks/task-edit-guard/hook.ts`, `constants.ts` | HOT-PATH, low |
| `tasks-todowrite-disabler` | BLOCKING | yes | pure `.some()` | `src/hooks/tasks-todowrite-disabler/hook.ts:15-31` | HOT-PATH, negligible |
| `background-task-blocker` | BLOCKING | yes (only for `background_task` tool) | none | `src/hooks/background-task-blocker/hook.ts` | HOT-PATH, negligible |
| `context-mode-enforcer` | BLOCKING | yes (when `context_mode.enforce`) | config + regex (`cat/head/tail`, `grep`) | `src/hooks/context-mode-enforcer/hook.ts` | HOT-PATH, low |
| `oracle-md-only` | BLOCKING+MUTATOR+NETWORK | yes (non-`.md` writes by planner) | `getAgentFromSession()` SDK HTTP or `readFileSync`/`readdirSync` fallback | `src/hooks/oracle-md-only/hook.ts:14-81` | HOT-PATH, med-high (runs twice) |
| `non-interactive-env` | MUTATOR | no | pure regex + `buildEnvPrefix` | `src/hooks/non-interactive-env/non-interactive-env-hook.ts:24-64` | HOT-PATH, low |
| `bash-file-read-guard` | MUTATOR | no | pure regex, rewrites `output.message` | `src/hooks/bash-file-read-guard.ts:21-44` | HOT-PATH, low |
| `mouse-notepad` | MUTATOR+NETWORK | no | `isCallerOrchestrator()` SDK HTTP | `src/hooks/mouse-notepad/hook.ts:10-43` | HOT-PATH, medium |
| `architect` | MUTATOR+NETWORK | no | same caller check + `pendingFilePaths` Map | `src/hooks/architect/tool-execute-before.ts:19-54` | HOT-PATH, medium |
| `rtk-bash-rewriter` | MUTATOR | no | regex rewrite; idle unless `rtk.enabled` and binary present | `src/hooks/rtk-bash-rewriter/hook.ts` | HOT-PATH, low/off |
| `quality-gate` (before) | READ_ONLY | no | Map `pendingCalls.set` only | `src/hooks/quality-gate/hook.ts:74-94` | HOT-PATH, negligible |
| `comment-checker` (before) | READ_ONLY | no | Map `registerPendingCall` only | `src/hooks/comment-checker/hook.ts:38-84` | HOT-PATH, negligible |
| `directory-agents-injector` (before) | READ_ONLY | no | no-op (`void input; void output`) | `src/hooks/directory-injector/factory.ts:62-68` | HOT-PATH, zero |
| `rules-injector` (before) | READ_ONLY | no | no-op | `src/hooks/rules-injector/hook.ts:55-61` | HOT-PATH, zero |

### 2.2 `tool.execute.after` (19 invocations)

| Hook | Purpose | Evidence | Tier |
|---|---|---|---|
| `tool-output-truncator` | Truncates whitelisted tool outputs (50k tokens default, 10k for webfetch; opt-in all via `experimental`) | `src/hooks/tool-output-truncator.ts` | POST-TOOL, low |
| `preemptive-compaction` | `session.summarize()` with 60s timeout, parallel so it never blocks | `src/hooks/preemptive-compaction.ts:59-112` | POST-TOOL, high but non-blocking |
| `quality-gate` | Biome lint on changed files | `src/hooks/quality-gate/hook.ts` | POST-TOOL, med-high |
| `comment-checker` | `@code-yeongyu/comment-checker` CLI on changed files | `src/hooks/comment-checker/hook.ts` | POST-TOOL, medium |
| `context-window-monitor` | Token accounting with headroom reminder | `src/hooks/context-window-monitor.ts:87-125` | POST-TOOL, low |
| `directory-agents-injector` | Injects `AGENTS.md` context; auto-disabled on OpenCode versions with native support | `src/plugin/hooks/create-tool-guard-hooks.ts` | POST-TOOL, low-med |
| `rules-injector` | Conditional `.morpheus/rules` injection | `src/hooks/rules-injector/hook.ts:63-85` | POST-TOOL, low-med |
| `empty-task-response-detector` | Warns when a `task` call returns empty output | `src/hooks/empty-task-response-detector.ts` | POST-TOOL, negligible |
| `agent-usage-reminder` | Agent-specific usage hints with persisted state | `src/hooks/agent-usage-reminder/hook.ts` | POST-TOOL, negligible |
| `category-skill-reminder` | Delegation reminders per category/skill | `src/hooks/category-skill-reminder/hook.ts:119-140` | POST-TOOL, negligible |
| `interactive-bash-session` | Tmux session bookkeeping after bash | `src/hooks/interactive-bash-session/hook.ts:129` | POST-TOOL, low idle |
| `edit-error-recovery` | Corrective guidance on known Edit mistakes | `src/hooks/edit-error-recovery/hook.ts` | POST-TOOL, low idle |
| `delegate-task-retry` | Retry guidance when delegation output matches error patterns | `src/hooks/delegate-task-retry/hook.ts` | POST-TOOL, low idle |
| `architect` | Post-tool side of orchestration hook | `src/hooks/architect/architect-hook.ts:23` | POST-TOOL, low |
| `task-resume-info` | Appends resume info for task/subagent sessions | `src/hooks/task-resume-info/hook.ts` | POST-TOOL, low |
| `hashline-read-enhancer` | Hash-anchor enrichment for reads (gated by `experimental.hashline_edit`) | `src/hooks/hashline-read-enhancer/hook.ts:167` | POST-TOOL, low |
| `json-error-recovery` | Action guidance on JSON parse errors | `src/hooks/json-error-recovery/hook.ts` | POST-TOOL, low idle |
| `read-image-resizer` | Downscales images past token limits | `src/hooks/read-image-resizer/hook.ts:124` | POST-TOOL, low |
| `task-notepad` | Task-scoped notepad persistence | `src/hooks/task-notepad/hook.ts:21` | POST-TOOL, low |

### 2.3 Prompt, message, and session triggers

| Hook | Trigger | Purpose | Evidence |
|---|---|---|---|
| `input-secret-guard` | `chat.message` | Blocks prompts containing secrets (allow-once/session overrides) | `src/hooks/input-secret-guard/hook.ts`, `src/plugin/chat-message.ts` |
| `keyword-detector` | `chat.message` | Ultrawork/search/analyze keyword modes | `src/hooks/keyword-detector/hook.ts:19` |
| `auto-slash-command` | `chat.message` | Detects and executes `/command` patterns | `src/hooks/auto-slash-command/hook.ts:36` |
| `start-work` | `chat.message` (conditional on output shape) | Starts mission state on ultrawork keywords | `src/hooks/start-work/start-work-hook.ts:51` |
| `stop-continuation-guard` | `chat.message` + `event` | Cancels background work on stop; consulted by enforcers | `src/hooks/stop-continuation-guard/hook.ts`, `src/plugin/event.ts` |
| `anthropic-effort` | `chat.params` | Effort override for max variants; the only hook `createChatParamsHandler` invokes | `src/hooks/anthropic-effort/hook.ts:37`, `src/plugin/chat-params.ts` |
| `env-context-injector` | `experimental.chat.messages.transform` | Injects env context into messages | `src/plugin/messages-transform.ts` |
| `thinking-block-validator` | `experimental.chat.messages.transform` | Validates thinking-block shape | `src/hooks/thinking-block-validator/hook.ts:105` |
| `evolution-hitl` | `experimental.chat.messages.transform` | Human-in-the-loop gate (only when `evolution.enabled`) | `src/plugin/messages-transform.ts` |
| `think-mode` | `event` (session cleanup) | Dynamic thinking budget; prompt switching lives in its module state | `src/hooks/think-mode/hook.ts:172-174`, `src/plugin/event.ts` |
| `matrix-loop` | `event` + direct calls from `before`/`chat.message` slash handling | Self-referential dev loop start/cancel | `src/plugin/event.ts`, `src/plugin/tool-execute-before.ts:156-196` |
| `task-continuation-enforcer` | `event` via `.handler` | Forces task completion (active when `experimental.task_system` is true) | `src/plugin/event.ts` |
| `todo-continuation-enforcer` | `event` via `.handler` | Legacy countdown enforcer (active only when task system is off) | `src/plugin/hooks/create-continuation-hooks.ts` |
| `session-recovery` | `event` session.error branch (direct call) | Recovers and re-prompts after recoverable errors | `src/plugin/event.ts:148-155` |
| `context-window-limit-recovery` | `event` (error/idle/updated) | Provider-agnostic context recovery | `src/hooks/context-window-limit-recovery/recovery-hook.ts:33-164` |
| `auto-update-checker` | `event` session.created | Plugin update check and startup toasts | `src/hooks/auto-update-checker/hook.ts:29-34` |
| `background-notification` | `event` | Routes events to BackgroundManager notifications | `src/hooks/background-notification/hook.ts:19-24` |
| `session-notification` | `event` (called as function) | OS idle notifications with sound | `src/hooks/session-notification.ts`, `src/plugin/event.ts:35` |
| `unstable-agent-babysitter` | `event` session.idle | Watches unstable agent behavior | `src/hooks/unstable-agent-babysitter/unstable-agent-babysitter-hook.ts:116-168` |
| `architect` | `event` via `.handler` | Orchestration lifecycle (error/idle/compact/delete) | `src/hooks/architect/event-handler.ts:19-192` |
| `plan-persister` | `event` + compacting rehydration | Persists plan state on idle, rebuilds context after compaction | `src/hooks/plan-persister/hook.ts`, `src/index.ts:92-96` |
| `compaction-todo-preserver` | `event` + compacting capture | Preserves todos across compaction | `src/hooks/compaction-todo-preserver/hook.ts:47-122`, `src/index.ts:86` |
| `compaction-context-injector` | compacting only | Injects background context after compaction | `src/index.ts:87-89` |
| `context-window-monitor`, `directory-agents-injector`, `rules-injector`, `agent-usage-reminder`, `category-skill-reminder`, `interactive-bash-session` | `event` (mostly session.deleted/compacted cleanup) | Per-session state cleanup beside their `after` work | `src/plugin/event.ts:39-46` |

For orchestration behavior (architect, continuation enforcers, matrix loop)
see `docs/orchestration.md`; for the task substrate see
`docs/task-system.md`; for full config keys see `docs/configurations.md`.

### 2.4 Registered but currently unwired

These hooks are constructed by `create-*-hooks.ts`, honor `disabled_hooks`,
and define handler methods, but no dispatcher under `src/plugin/` or
`src/index.ts` calls them today, so they cost nothing at runtime:

| Hook | Defined handler | Status |
|---|---|---|
| `failure-counter` | `tool.execute.after` + `event` | No call site (`src/hooks/failure-counter/hook.ts`) |
| `webfetch-redirect-guard` | `tool.execute.before` + `after` | No call site (`src/hooks/webfetch-redirect-guard/hook.ts:62-93`) |
| `hashline-edit-diff-enhancer` | `tool.execute.before` + `after` | No call site (`src/hooks/hashline-edit-diff-enhancer/hook.ts:52-67`) |
| `evolution-watcher` | `tool.execute.before` + `after` | No call site (also gated by `evolution.enabled`) |
| `evolution-compressor` | module hook | No call site (also gated by `evolution.enabled`) |
| `runtime-fallback` | module hook | No call site (`src/plugin/hooks/create-session-hooks.ts:163`) |
| `design-intent-preserver` | `chat.message`-shaped | No call site in `src/plugin/chat-message.ts` |
| `tool-pair-validator` | `experimental.chat.messages.transform`-shaped | No call site in `src/plugin/messages-transform.ts` |

Partials: `think-mode` exposes a `chat.params`-shaped handler with no call
site (only its `event` handler is dispatched); `preemptive-compaction`
exposes an `event` cleanup handler with no call site (only its `after`
handler runs). `startup-toast` has no factory at all: it is a boolean flag
read as `showStartupToast` by `auto-update-checker`
(`src/plugin/hooks/create-session-hooks.ts:106`).

## 3. Enable / disable guide

### 3.1 Where

Project `matrixx.jsonc` and/or user `~/.config/opencode/matrixx.jsonc`
(JSONC). Restart OpenCode after changing `disabled_hooks` (evaluated at
plugin init, not per call).

```jsonc
{
  // disable any HookNameSchema entry:
  "disabled_hooks": ["comment-checker"],
  "experimental": {
    // wrap all factories in try/catch (default true):
    "safe_hook_creation": true
  }
}
```

Schema: `disabled_hooks: z.array(HookNameSchema).optional()`
(`src/config/schema/matrixx-config.ts:53`). Base + override merge by union:
`src/plugin-config.ts:155-176`. Related: `docs/configurations.md`.

### 3.2 Extra gates (hook registered but idle unless set)

| Gate | Effect | Source |
|---|---|---|
| `experimental.preemptive_compaction` | `preemptive-compaction` constructed only when true | `src/plugin/hooks/create-session-hooks.ts`, `src/config/schema/experimental.ts:6` |
| `experimental.hashline_edit` | hashline enhancers pass through when false | `src/plugin/hooks/create-tool-guard-hooks.ts` |
| `experimental.task_system` (default true) | selects `task-continuation-enforcer` vs legacy `todo-continuation-enforcer` | `src/plugin/hooks/create-continuation-hooks.ts`, `src/config/schema/experimental.ts:10` |
| `evolution.enabled` | `evolution-watcher`, `evolution-compressor`, `evolution-hitl` constructed only when true | `src/plugin/hooks/create-continuation-hooks.ts`, `create-tool-guard-hooks.ts` |
| `rtk.enabled` | `rtk-bash-rewriter` constructed only when true (still passes through without binary) | `src/plugin/hooks/create-session-hooks.ts`, `src/hooks/rtk-bash-rewriter/hook.ts` |
| `failure_counter.enabled` (default true) | `failure-counter` constructed unless explicitly false | `src/plugin/hooks/create-session-hooks.ts:140` |
| `comment_checker`, `matrix_loop`, `context_mode`, `notification.force_enable` | per-feature config consumed by the matching hook | `src/config/schema/matrixx-config.ts` |

`directory-agents-injector` auto-disables on OpenCode versions with native
AGENTS injection (`src/plugin/hooks/create-tool-guard-hooks.ts`).
`task-resume-info` is always constructed (no gate besides `disabled_hooks`).
Check the hook factory before assuming cost.

### 3.3 Profiles

Minimal-write profile (keeps guards, drops NETWORK + heavy `after` work):

```jsonc
{ "disabled_hooks": ["secret-leak-guard", "oracle-md-only", "mouse-notepad", "architect", "quality-gate", "comment-checker", "preemptive-compaction"] }
```

> Keep `secret-leak-guard` unless writes are trusted. It is the single
> biggest `before` latency source (subprocess spawn per tool call).

Nuclear debug profile (measure raw OpenCode overhead):

```jsonc
{ "disabled_hooks": ["secret-leak-guard", "oracle-md-only", "mouse-notepad", "architect", "quality-gate", "comment-checker", "preemptive-compaction", "context-mode-enforcer", "task-edit-guard", "task-notepad", "task-continuation-enforcer", "todo-continuation-enforcer", "rules-injector", "directory-agents-injector"] }
```

## 4. Performance model (why `write` feels slow)

Per-`write` cost, structurally (no measured per-hook timings exist; do not
treat the shape below as a benchmark):

```text
OpenCode dispatch
+ before: max(Wave1) + max(Wave2 incl. gitleaks spawn + existsSync + oracle NETWORK) + sum(Wave3 sequential mutators)
+ tool execution itself (Write)
+ after: toolOutputTruncator + max(preemptiveCompaction, qualityGate Biome, 16 sequential afters)
```

Key points:

1. Dispatch overhead is awaits and Map writes. Cost concentrates in hooks
   that do I/O: `secretLeakGuard` spawns `gitleaks` per tool call (Wave 2),
   which dwarfs all other `before` costs combined.
2. `oracleMdOnly`/`mouseNotepad`/`architectHook` do SDK HTTP
   (`getAgentFromSession` / `isCallerOrchestrator`) with filesystem fallback
   scans on the critical path, and `oracleMdOnly` runs twice.
3. `after` is the longer tail: 16 sequential awaits plus Biome plus the
   comment-checker CLI. `preemptiveCompaction` already runs parallel for
   this reason.
4. Even no-op hooks (`directoryAgentsInjector`, `rulesInjector` in `before`)
   cost one microtask hop each. Only `disabled_hooks` removes them.
5. Wave 3 must stay sequential (mutation order). Parallelizing it would let
   prompt-prefix writes stomp each other and reorder the architect reminder.

## 5. Experiments and evaluation

### Exp-0: static classification (checked in, partly stale)

`src/plugin/hook-mutation-classification.md` audits each `before` hook for
mutates/throws/I/O with file:line evidence and enabled the 3-wave
parallelization. It describes an older 13-hook shape and predates
`taskEditGuard`, `contextModeEnforcer`, `backgroundTaskBlocker`, and
`rtkBashRewriter`. Treat its table as evidence for the hooks it covers, not
as a current inventory. Section 2 above is the current inventory.

### Exp-1: `before` dispatch micro-bench (stale shape, re-run proposed)

`src/plugin/tool-execute-before.bench.ts` runs with
`bun test src/plugin/tool-execute-before.bench.ts` and is deliberately named
`.bench.ts` so CI test sweeps skip it. It encodes Wave 1 = 4, Wave 2 = 5,
Wave 3 = 5 (14 invocations, `oracleMdOnly` twice) and asserts wave ordering
plus exact per-name counts against stub hooks. Production now dispatches
18 invocations (Wave 2 gained `taskEditGuard`, `contextModeEnforcer`,
`backgroundTaskBlocker`; Wave 3 gained `rtkBashRewriter`). Historical numbers
from this bench therefore do not describe the current pipeline. Proposed:
update the bench waves to the Section 1.3 shape, re-run, and record
p50/p95/p99 here.

### Exp-2: trigger inventory scan (method, rerunnable)

Enumerate subscribed events by scanning factory return objects for event
literals (`tool.execute.before|after`, `chat.message`, `chat.params`,
`transform`, `event`) across `src/hooks/`, then confirm each hit has a call
site in `src/plugin/` dispatchers or `src/index.ts`. That method produced
Section 2.4. Rerun on demand; keep scan scripts out of git.

### Exp-3: write-path walkthrough (static, this doc)

A single `write` to an existing file: Wave 1 registers, Wave 2 guards
(`writeExistingFileGuard.existsSync`, leak/env/task guards) allow or throw,
Wave 3 mutators rewrite, the tool runs, then the `after` chain
(`toolOutputTruncator` first, parallel compaction/lint, 16 sequential).
Blocking hooks: `secretLeakGuard`, `envFileWriteGuard`,
`writeExistingFileGuard`, `tasksTodowriteDisabler`, `taskEditGuard`,
`backgroundTaskBlocker`, `contextModeEnforcer`, `oracleMdOnly` (blocking
half). See also `src/hooks/AGENTS.md`, though its counts (~54 hooks,
13 PreToolUse) are stale relative to this doc.

### Exp-4 (proposed, not yet run): per-hook wall-clock + ablation

Requires a temporary timing wrapper plus real tool calls under controlled
config. Procedure:

1. Wrap each dispatch call in `tool-execute-before/after.ts` with
   `performance.now()` deltas logged via `src/shared/logger.ts`
   (to `/tmp/matrixx.log`), gated behind a new
   `experimental.hook_timing` flag (default off).
2. Ablation matrix on a fixed fixture (50 `write` new + 50 `edit`): (a) all
   hooks on, (b) minimal-write profile (3.3), (c) nuclear profile, (d)
   single-hook toggles for `secret-leak-guard`, `oracle-md-only`,
   `quality-gate`.
3. Report per-hook mean/p50/p99 plus share of total, `before` vs `after`
   split, gitleaks spawn time isolated, NETWORK hook latency isolated.
4. Fill Table 5.1 below. Keep raw logs out of git, commit only the summary.

Table 5.1, results placeholder (fill after Exp-4):

| Profile | mean/write | p99/write | top hook | top share |
|---|---|---|---|---|
| all-on | TBD | TBD | TBD (`secretLeakGuard` expected) | TBD |
| minimal-write | TBD | TBD | TBD | TBD |
| nuclear | TBD | TBD | OpenCode baseline | n/a |

## 6. Recommendations

1. Keep the 3-wave `before` structure. Do not parallelize Wave 3 (mutation
   order). Update the bench waves to the 18-invocation shape before trusting
   its numbers again.
2. Biggest wins, in order: skip `gitleaks` for read-only tools or debounce
   it; memoize `getAgentFromSession`/`isCallerOrchestrator` per session;
   avoid the double `oracleMdOnly` invocation; parallelize or defer `after`
   Biome/CLI work.
3. Resolve Section 2.4: either wire the 8 unwired hooks into dispatchers or
   remove their factories and schema entries so `disabled_hooks` stops
   implying control that does nothing.
4. Add the `experimental.hook_timing` flag plus per-hook histogram (Exp-4)
   before further optimization. Measure first.
5. Document every new hook with trigger event, class, throws, I/O, and
   evidence file:line. Update Sections 2.x and `HookNameSchema` together.
6. Anti-patterns (`src/hooks/AGENTS.md`): no heavy `tool.execute.before`
   work, no network or subprocess on the hot path without a cache, no new
   sequential `after` hooks without a parallelization review.

## 7. Sources

- `src/config/schema/hooks.ts`, `src/config/schema/matrixx-config.ts`,
  `src/config/schema/experimental.ts`
- `src/create-hooks.ts`, `src/index.ts`
- `src/plugin-interface.ts`
- `src/plugin/hooks/create-core-hooks.ts`,
  `src/plugin/hooks/create-session-hooks.ts`,
  `src/plugin/hooks/create-tool-guard-hooks.ts`,
  `src/plugin/hooks/create-transform-hooks.ts`,
  `src/plugin/hooks/create-continuation-hooks.ts`,
  `src/plugin/hooks/create-skill-hooks.ts`
- `src/plugin/tool-execute-before.ts`, `src/plugin/tool-execute-after.ts`,
  `src/plugin/tool-execute-before.bench.ts`,
  `src/plugin/hook-mutation-classification.md`
- `src/plugin/chat-message.ts`, `src/plugin/chat-params.ts`,
  `src/plugin/messages-transform.ts`, `src/plugin/event.ts`,
  `src/plugin/tool-definition.ts`
- `src/shared/safe-create-hook.ts`, `src/plugin-config.ts:155-176`
- `src/hooks/AGENTS.md`, `src/hooks/index.ts`,
  `docs/cost-performance-proposals.md`
- Related docs: `docs/orchestration.md`, `docs/task-system.md`,
  `docs/configurations.md`
