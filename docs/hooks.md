# Hooks Reference

> **Audience:** users configuring Matrixx (which hooks to keep, disable, or tune) and engineers adding or debugging hooks.
> **Version:** 2.6.10 (`package.json`), verified against `src/`.
> **Scope:** `src/hooks/`, `src/create-hooks.ts`, `src/plugin/hooks/*`, `src/plugin-interface.ts`, `src/plugin/tool-execute-{before,after}.ts`, `src/config/schema/hooks.ts`, `src/index.ts`.
> **How to read this:** Section 1 explains when hooks run. Section 2 lists every hook with **what** it does, **why** it exists, and **when** it fires. Section 3 shows how to disable or tune hooks. Sections 4–5 cover cost.

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
- Real-world cost sits in a few hooks, not in dispatch overhead: one
  subprocess (`secret-leak-guard` spawns `gitleaks`) and three SDK-HTTP hooks
  (`oracle-md-only`, `mouse-notepad`, `architect`), plus sequential `after`
  work (`quality-gate` Biome, `comment-checker` CLI).
- 8 registered hooks have factories but no call site in any current
  dispatcher (Section 2.4). They are constructed, appear in config, and cost
  nothing at runtime. `startup-toast` is a flag, not a factory.
- No per-hook wall-clock instrumentation exists today; Section 5 explains how
  to measure.
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
| `event` | `createEventHandler` (`src/plugin/event.ts`) | session, recovery, loop, guard, and injector hooks (Section 2.3) |
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
      preemptiveCompaction (60s session.summarize timeout, parallel, never blocks),
      qualityGate (Biome, parallel),
      remainingHooks() sequential (16):
        contextWindowMonitor -> commentChecker -> directoryAgentsInjector
        -> rulesInjector -> emptyTaskResponseDetector -> agentUsageReminder
        -> categorySkillReminder -> interactiveBashSession -> editErrorRecovery
        -> delegateTaskRetry -> architectHook -> taskResumeInfo
        -> hashlineReadEnhancer -> jsonErrorRecovery -> readImageResizer
        -> taskNotepad
    ])
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

Each entry states **what** the hook does, **why** it exists (the failure it
prevents), and **when** it fires.

### 2.1 `tool.execute.before` hot path (17 hooks, 18 invocations)

Trigger for all rows: every tool call, before execution. The `When` column
narrows which tool calls are affected.

| Hook | What + why | When it fires / what it does on fire | Class / cost |
|---|---|---|---|
| `secret-leak-guard` | Scans tool arguments with `gitleaks`; blocks the call on a hit. Exists to stop agents from writing or exfiltrating credentials. | Every tool call; dominant cost (subprocess spawn). | BLOCKING+NETWORK, high |
| `env-file-write-guard` | Blocks writes to sensitive env files by regex. Exists so agents cannot overwrite `.env` and credential files. | Write/edit/bash targeting sensitive paths. Pure regex. | BLOCKING, low |
| `write-existing-file-guard` | Fails `Write` when the file already exists, forcing `Edit`. Exists to prevent accidental whole-file overwrites. | `Write` tool on an existing path (one `existsSync`). | BLOCKING, low |
| `task-edit-guard` | Blocks raw Write/Edit/Read of `.matrixx/plans/*.md` and task JSON. Exists to force `plan_*` / `task_*` tools so plan and task state stay consistent. | Tool calls touching plan/task paths. | BLOCKING, low |
| `tasks-todowrite-disabler` | Blocks the `todowrite` tool while the file-backed task system is on. Exists to keep one task substrate and avoid split-brain todos. | `todowrite` calls only. | BLOCKING, negligible |
| `background-task-blocker` | Blocks the `background_task` tool. Exists to route all background work through `task(run_in_background=true)` and one manager. | `background_task` tool only. | BLOCKING, negligible |
| `context-mode-enforcer` | Blocks raw `grep`/`glob`/`read`/`cat`-style access when `context_mode.enforce` is set. Exists to force `ctx_*` sandboxed analysis so raw bytes stay out of context. | Read-family tools while enforcement is on. | BLOCKING, low |
| `oracle-md-only` | Blocks non-`.md` writes from planner sessions and rewrites when needed. Exists to keep the planning phase from editing code. | Planner-session writes; runs twice per call (Wave 2 + Wave 3), SDK HTTP or fs fallback. | BLOCKING+MUTATOR+NETWORK, med-high |
| `non-interactive-env` | Prefixes bash commands with a non-interactive env setup. Exists because agents run without a TTY and need a predictable environment. | Every `bash` call. Pure regex. | MUTATOR, low |
| `bash-file-read-guard` | Rewrites bash file reads (`cat`/`head`/redirects) into a nudge toward the `Read` tool. Exists because `Read` yields hashline anchors and guard coverage that bash reads bypass. | `bash` containing read-like patterns. Rewrites `output.message`. | MUTATOR, low |
| `mouse-notepad` | Prepends the notepad directive to worker `task` prompts issued by the orchestrator. Exists so workers persist findings in notepads. | `task` calls from the orchestrator (SDK caller check). | MUTATOR+NETWORK, medium |
| `architect` | Prepends the architect reminder outermost on delegated tasks. Exists to keep workers inside mission scope. | `task` calls (before side). | MUTATOR+NETWORK, medium |
| `rtk-bash-rewriter` | Rewrites bash into RTK-compressed equivalents. Exists to cut token spend on bash output. | `bash` when `rtk.enabled` and the binary is present; otherwise silent passthrough. | MUTATOR, low/off |
| `quality-gate` (before) | Registers the pending call in a `Map`. Exists to pair before/after so lint runs only on changed files. | Writes/edits to lintable files. | READ_ONLY, negligible |
| `comment-checker` (before) | Registers the pending call. Exists for the same before/after pairing for the comment CLI. | Changed files. | READ_ONLY, negligible |
| `directory-agents-injector` (before) | No-op (`void input; void output`). Exists as a placeholder — the real work runs in `after`. | Never (in `before`). | READ_ONLY, zero |
| `rules-injector` (before) | No-op. Same split-phase design as above. | Never (in `before`). | READ_ONLY, zero |

Evidence: `src/hooks/secret-leak-guard/hook.ts:20-60`, `src/hooks/env-file-write-guard/hook.ts:18-48`, `src/hooks/write-existing-file-guard/hook.ts:10-48`, `src/hooks/task-edit-guard/hook.ts` + `constants.ts`, `src/hooks/tasks-todowrite-disabler/hook.ts:15-31`, `src/hooks/background-task-blocker/hook.ts`, `src/hooks/context-mode-enforcer/hook.ts`, `src/hooks/oracle-md-only/hook.ts:14-81`, `src/hooks/non-interactive-env/non-interactive-env-hook.ts:24-64`, `src/hooks/bash-file-read-guard.ts:21-44`, `src/hooks/mouse-notepad/hook.ts:10-43`, `src/hooks/architect/tool-execute-before.ts:19-54`, `src/hooks/rtk-bash-rewriter/hook.ts`, `src/hooks/quality-gate/hook.ts:74-94`, `src/hooks/comment-checker/hook.ts:38-84`, `src/hooks/directory-injector/factory.ts:62-68`, `src/hooks/rules-injector/hook.ts:55-61`.

### 2.2 `tool.execute.after` (19 invocations)

Trigger for all rows: after every tool call. The `When` column narrows the
effective condition (many hooks are idle unless their condition holds).

| Hook | What + why | When it acts |
|---|---|---|
| `tool-output-truncator` | Truncates whitelisted tool outputs (50k tokens default, 10k for webfetch; opt-in all via `experimental`). Exists to stop huge outputs from blowing the context window. | After every whitelisted tool call; always runs first. |
| `preemptive-compaction` | Runs `session.summarize()` with a 60s timeout. Exists to compact proactively at ~78% instead of crashing at the hard limit. | When the usage threshold is crossed; parallel, never blocks. |
| `quality-gate` | Runs Biome lint on changed files. Exists to catch style and type errors immediately after edits. | After writes/edits registered in `before`. |
| `comment-checker` | Runs the `@code-yeongyu/comment-checker` CLI on changed files. Exists for comment hygiene. | After changed files. |
| `context-window-monitor` | Token accounting with a headroom reminder. Exists as the ~70% early warning before preemptive compaction. | After tool calls; read-only. |
| `directory-agents-injector` | Injects `AGENTS.md` context. Exists so agents follow repo conventions. | After reads; auto-disabled on OpenCode versions with native AGENTS injection. |
| `rules-injector` | Injects `.morpheus/rules` conditionally. Exists to put project rules in context. | After calls, when rule files match. |
| `empty-task-response-detector` | Warns when a `task` call returns empty output. Exists to surface silent worker failure. | After `task` calls with empty output. |
| `agent-usage-reminder` | Agent-specific usage hints with persisted state. Exists to correct per-agent tool misuse. | After tool calls. |
| `category-skill-reminder` | Delegation reminders per category/skill. Exists to push orchestrators toward category-routed delegation. | After work-indicating tools. |
| `interactive-bash-session` | Tmux session bookkeeping after bash. Exists to track interactive sessions. | After `bash`; otherwise idle. |
| `edit-error-recovery` | Injects corrective guidance on known Edit mistakes. Exists for fast recovery from `oldString` errors. | When `Edit` fails with a known pattern; otherwise idle. |
| `delegate-task-retry` | Injects retry guidance when delegation output matches error patterns. Exists to recover failed delegations without user intervention. | When delegation output matches; otherwise idle. |
| `architect` | Post-tool side of the orchestration hook. Exists for mission lifecycle bookkeeping. | After `task` calls. |
| `task-resume-info` | Appends resume info for task/subagent sessions. Exists for continuity across sessions. | After task/subagent sessions; always constructed (no gate besides `disabled_hooks`). |
| `hashline-read-enhancer` | Adds hash-anchor enrichment to reads. Exists to give edits stable `LINE#ID` anchors. | After reads, when `experimental.hashline_edit` is on. |
| `json-error-recovery` | Injects action guidance on JSON parse errors. Exists to fix malformed tool arguments. | On JSON errors; otherwise idle. |
| `read-image-resizer` | Downscales images past token limits. Exists to keep image reads inside context budgets. | After image reads over the limit. |
| `task-notepad` | Persists task-scoped notepads. Exists for per-task wisdom accumulation. | After task tools. |

Evidence: `src/hooks/tool-output-truncator.ts`, `src/hooks/preemptive-compaction.ts:59-112`, `src/hooks/quality-gate/hook.ts`, `src/hooks/comment-checker/hook.ts`, `src/hooks/context-window-monitor.ts:87-125`, `src/plugin/hooks/create-tool-guard-hooks.ts`, `src/hooks/rules-injector/hook.ts:63-85`, `src/hooks/empty-task-response-detector.ts`, `src/hooks/agent-usage-reminder/hook.ts`, `src/hooks/category-skill-reminder/hook.ts:119-140`, `src/hooks/interactive-bash-session/hook.ts:129`, `src/hooks/edit-error-recovery/hook.ts`, `src/hooks/delegate-task-retry/hook.ts`, `src/hooks/architect/architect-hook.ts:23`, `src/hooks/task-resume-info/hook.ts`, `src/hooks/hashline-read-enhancer/hook.ts:167`, `src/hooks/json-error-recovery/hook.ts`, `src/hooks/read-image-resizer/hook.ts:124`, `src/hooks/task-notepad/hook.ts:21`.

### 2.3 Prompt, message, and session triggers

| Hook | Trigger (when) | What + why |
|---|---|---|
| `input-secret-guard` | `chat.message` | Blocks prompts containing secrets (allow-once/session overrides). Exists to keep credentials out of the conversation. |
| `keyword-detector` | `chat.message` | Detects ultrawork/search/analyze keywords and switches modes. Exists to route terse user intents to the right workflow. |
| `auto-slash-command` | `chat.message` | Detects and executes `/command` patterns. Exists so slash commands work inline. |
| `start-work` | `chat.message` (conditional on output shape) | Starts mission state on ultrawork keywords. Exists to bootstrap orchestration without an explicit command. |
| `stop-continuation-guard` | `chat.message` + `event` | Cancels background work on stop; consulted by enforcers so in-flight agents that asked a question are not killed. Exists for clean shutdowns. |
| `anthropic-effort` | `chat.params` | Effort override for max variants; the only hook `createChatParamsHandler` invokes. Exists to control reasoning effort per model. |
| `env-context-injector` | `experimental.chat.messages.transform` | Injects env context into messages. Exists so agents see the working environment. |
| `thinking-block-validator` | `experimental.chat.messages.transform` | Validates thinking-block shape. Exists to catch malformed reasoning blocks early. |
| `tool-pair-validator` | `experimental.chat.messages.transform`-shaped | Validates tool-call pairing. Currently has no call site (Section 2.4). |
| `design-intent-preserver` | `chat.message`-shaped | Preserves design intent across turns. Currently has no call site (Section 2.4). |
| `evolution-hitl` | `experimental.chat.messages.transform` | Human-in-the-loop gate for evolution writes. Exists for governance over self-modification; only when `evolution.enabled`. |
| `think-mode` | `event` (session cleanup) | Dynamic thinking budget; prompt switching lives in its module state. Exists to scale reasoning effort per session. |
| `matrix-loop` | `event` + direct calls from `before`/`chat.message` slash handling | Self-referential dev loop start/cancel. Exists for `/matrix-loop` and `/ulw-loop` workflows. |
| `task-continuation-enforcer` | `event` via `.handler` | Forces task completion with countdown nudges. Exists so multi-step work is not dropped; active when the task system is on. |
| `todo-continuation-enforcer` | `event` via `.handler` | Legacy countdown enforcer. Exists for the same purpose on the legacy path; active only when the task system is off. |
| `session-recovery` | `event` session.error branch (direct call) | Recovers and re-prompts after recoverable errors. Exists to survive transient session failures. |
| `context-window-limit-recovery` | `event` (error/idle/updated) | Provider-agnostic context recovery; parses token-limit errors only (reactive). Exists as the last resort after monitor (70%) and preemptive compaction (78%). |
| `auto-update-checker` | `event` session.created | Plugin update check and startup toasts. Exists to notify about new versions. |
| `background-notification` | `event` | Routes events to BackgroundManager notifications. Exists for background-task visibility. |
| `session-notification` | `event` (called as function) | OS idle notifications with sound. Exists to alert on idle completion. |
| `unstable-agent-babysitter` | `event` session.idle | Watches unstable agent behavior. Exists to nudge stuck agents. |
| `architect` | `event` via `.handler` | Orchestration lifecycle (error/idle/compact/delete). Exists to maintain mission state. |
| `plan-persister` | `event` + compacting rehydration | Persists plan state on idle, rebuilds context after compaction. Exists so plans survive compaction. |
| `compaction-todo-preserver` | `event` + compacting capture | Preserves todos across compaction. Exists so task progress survives summarization. |
| `compaction-context-injector` | compacting only | Injects background context after compaction. Exists so background results are not lost. |
| `context-window-monitor`, `directory-agents-injector`, `rules-injector`, `agent-usage-reminder`, `category-skill-reminder`, `interactive-bash-session` | `event` (mostly session.deleted/compacted cleanup) | Per-session state cleanup beside their `after` work. Exists to avoid cross-session leaks. |
| `knowledge-hub-guard` | `tool.execute.before` | Denies writes inside hub roots (read-only KB). Exists to protect the external corpus; user-approved writes go through `knowledge_hub_confirm`. |
| `knowledge-hub-injector` | `experimental.chat.messages.transform` | Injects the hub router index once per session. Exists for zero-read KB routing. |
| `knowledge-hub-search-nudge` | `tool.execute.before` | Warns (never blocks) when agents reach for websearch with hubs configured. Exists as a backstop for web-first habits. |
| `evolution-watcher` | `tool.execute.before` + `after`-shaped | Records tool traces for the evolution loop. Exists to feed session learning; only when `evolution.enabled`. Currently has no call site (Section 2.4). |
| `evolution-compressor` | module hook | Compresses traces into distilled knowledge, budgeted per hour. Exists for async session learning; only when `evolution.enabled`. Currently has no call site (Section 2.4). |
| `runtime-fallback` | module hook | Retries failed model calls on fallbacks with cooldown. Exists for provider resilience. Currently has no call site (Section 2.4). |

Evidence: `src/hooks/input-secret-guard/hook.ts` + `src/plugin/chat-message.ts`, `src/hooks/keyword-detector/hook.ts:19`, `src/hooks/auto-slash-command/hook.ts:36`, `src/hooks/start-work/start-work-hook.ts:51`, `src/hooks/stop-continuation-guard/hook.ts` + `src/plugin/event.ts`, `src/hooks/anthropic-effort/hook.ts:37` + `src/plugin/chat-params.ts`, `src/plugin/messages-transform.ts`, `src/hooks/thinking-block-validator/hook.ts:105`, `src/hooks/think-mode/hook.ts:172-174` + `src/plugin/event.ts`, `src/plugin/event.ts` + `src/plugin/tool-execute-before.ts:156-196`, `src/plugin/hooks/create-continuation-hooks.ts`, `src/plugin/event.ts:148-155`, `src/hooks/context-window-limit-recovery/recovery-hook.ts:33-164`, `src/hooks/auto-update-checker/hook.ts:29-34`, `src/hooks/background-notification/hook.ts:19-24`, `src/hooks/session-notification.ts` + `src/plugin/event.ts:35`, `src/hooks/unstable-agent-babysitter/unstable-agent-babysitter-hook.ts:116-168`, `src/hooks/architect/event-handler.ts:19-192`, `src/hooks/plan-persister/hook.ts` + `src/index.ts:92-96`, `src/hooks/compaction-todo-preserver/hook.ts:47-122` + `src/index.ts:86`, `src/index.ts:87-89`, `src/plugin/event.ts:39-46`, `src/hooks/knowledge-hub-guard/hook.ts`, `src/hooks/knowledge-hub-injector/hook.ts`, `src/hooks/knowledge-hub-search-nudge/hook.ts`.

For orchestration behavior (architect, continuation enforcers, matrix loop)
see `orchestration.md`; for the task substrate see
`task-system.md`; for full config keys see `configurations.md`.

### 2.4 Previously unwired — now wired or removed

Six hooks formerly listed here are now wired into dispatchers (all honor
`disabled_hooks`); two dead hooks were removed outright:

| Hook | Defined handler | Status |
|---|---|---|
| `webfetch-redirect-guard` | `tool.execute.before` + `after` | Wired (`src/plugin/tool-execute-before.ts`, `src/plugin/tool-execute-after.ts`) |
| `evolution-watcher` | `tool.execute.before` + `after` | Wired (also gated by `evolution.enabled`) |
| `evolution-compressor` | module hook + `event` + compacting | Wired (`src/plugin/event.ts`, `src/index.ts`) (also gated by `evolution.enabled`) |
| `runtime-fallback` | module hook + `event` + `chat.message` | Wired (`src/plugin/event.ts`, `src/plugin/chat-message.ts`) |
| `design-intent-preserver` | `chat.message`-shaped | Wired in `src/plugin/chat-message.ts` |
| `tool-pair-validator` | `experimental.chat.messages.transform`-shaped | Wired in `src/plugin/messages-transform.ts` |

Removed: `failure-counter` (`tool.execute.after` + `event`) and
`hashline-edit-diff-enhancer` (`tool.execute.before` + `after`) — no call
site ever existed and both have been deleted. `disabled_hooks` entries for
these names are silently dropped via `migrateHookNames` for backwards
compatibility.

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
`src/plugin-config.ts:155-176`. Related: `configurations.md`.

### 3.2 Extra gates (hook registered but idle unless set)

| Gate | Effect | Source |
|---|---|---|
| `experimental.preemptive_compaction` | `preemptive-compaction` constructed only when true | `src/plugin/hooks/create-session-hooks.ts`, `src/config/schema/experimental.ts:6` |
| `experimental.hashline_edit` | hashline enhancers pass through when false | `src/plugin/hooks/create-tool-guard-hooks.ts` |
| `experimental.task_system` (default true) | selects `task-continuation-enforcer` vs legacy `todo-continuation-enforcer` | `src/plugin/hooks/create-continuation-hooks.ts`, `src/config/schema/experimental.ts:10` |
| `evolution.enabled` | `evolution-watcher`, `evolution-compressor`, `evolution-hitl` constructed only when true | `src/plugin/hooks/create-continuation-hooks.ts`, `create-tool-guard-hooks.ts` |
| `rtk.enabled` | `rtk-bash-rewriter` constructed only when true (still passes through without binary) | `src/plugin/hooks/create-session-hooks.ts`, `src/hooks/rtk-bash-rewriter/hook.ts` |
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

## 5. Measuring hook cost

No per-hook wall-clock instrumentation exists today. Notes for engineers:

- `src/plugin/hook-mutation-classification.md` audits each `before` hook for
  mutates/throws/I/O with file:line evidence and enabled the 3-wave
  parallelization. It describes an older 13-hook shape and predates
  `taskEditGuard`, `contextModeEnforcer`, `backgroundTaskBlocker`, and
  `rtkBashRewriter`. Treat its table as evidence for the hooks it covers, not
  as a current inventory. Section 2 above is the current inventory.
- `src/plugin/tool-execute-before.bench.ts` (run with
  `bun test src/plugin/tool-execute-before.bench.ts`, skipped by CI test
  sweeps by name) encodes an older wave shape (14 invocations). Production
  now dispatches 18. Update the bench waves to the Section 1.3 shape before
  trusting its numbers.
- To get real per-hook timings: wrap each dispatch call in
  `tool-execute-before/after.ts` with `performance.now()` deltas logged via
  `src/shared/logger.ts` (to `/tmp/matrixx.log`), gated behind a new
  `experimental.hook_timing` flag (default off). Suggested ablation matrix on
  a fixed fixture (50 `write` new + 50 `edit`): all-on, minimal-write profile
  (3.3), nuclear profile, and single-hook toggles for `secret-leak-guard`,
  `oracle-md-only`, `quality-gate`. Keep raw logs out of git; commit only the
  summary.
- Enumerating subscribed events (the method behind Section 2.4): scan factory
  return objects for event literals (`tool.execute.before|after`,
  `chat.message`, `chat.params`, `transform`, `event`) across `src/hooks/`,
  then confirm each hit has a call site in `src/plugin/` dispatchers or
  `src/index.ts`. Rerun on demand; keep scan scripts out of git.

## 6. Guidance for contributors

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
4. Add per-hook timing (Section 5) before further optimization. Measure first.
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
- `src/hooks/AGENTS.md`, `src/hooks/index.ts`
- Related docs: `orchestration.md`, `task-system.md`,
  `configurations.md`, `research/cost-performance.md`
