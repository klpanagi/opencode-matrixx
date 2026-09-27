# Legacy Todo System: Removal & Migration

> **Audience:** Anyone with a `matrixx.json` / `matrixx.jsonc` written before v2.7, or reading a log line that mentions a hook name they cannot find.
> **Status:** The legacy todo system is **gone**. The file-backed task system in `docs/task-system.md` is the only substrate.

The short version: nothing broke, and nothing you need to change is urgent. The four legacy hook names and the three config keys that used to toggle them are still **accepted** so old files keep loading, but they are **no-ops**. Remove them when convenient.

## What Was Removed

The legacy system wrapped OpenCode's ephemeral session-memory todos. The file-backed task system (`T-{uuid}.json` under `.matrixx/tasks/`) replaced it, and the legacy path has now been deleted outright:

| Retired hook | What it did | Replacement |
|--------------|--------------|-------------|
| `todo-continuation-enforcer` | Idle-event countdown that pushed the agent to finish leftover session todos | `task-continuation-enforcer`, which counts file-backed tasks |
| `compaction-todo-preserver` | Re-injected the todo list after a compaction so summarization could not lose it | Nothing. File-backed tasks are re-read from disk after compaction, so there is nothing to preserve |
| `tasks-todowrite-disabler` | Blocking `tool.execute.before` that threw on the two legacy todo tools, steering the model to the task workflow | Nothing needed. The tools stay denied in `tool-config-handler.ts`, and no prompt mentions them |
| `task-notepad` | Injected a `.matrixx/tasks` context fragment (task counts) at session start | Nothing needed. `task-continuation-enforcer` and `task_list` read the store on demand |

Alongside the hooks, the removal also collapsed the `useTaskSystem` prompt fork (agents had a todo-discipline branch), made the task-system pivot unconditional, and rewrote every prompt, skill, and command payload to name `task_create` / `task_list` directly.

## Config Keys That Are Now No-Ops

These keys still parse. Setting them changes nothing at runtime. If a value is `false`, Matrixx emits one deprecation log line and a single startup toast per session, then keeps going.

| Key | Was | Now |
|-----|-----|-----|
| `tasks.enabled` | Master switch: `false` unregistered the `task_*` tools and fell back to the todo path | Ignored. The task system is unconditional |
| `experimental.task_system` | Earlier name for the same switch | Ignored |
| `new_task_system_enabled` | Oldest alias of the same switch | Ignored |

`morpheus.tasks.*` and `task.pollTimeoutMs` were **not** neutered. They still supply fallback values for storage keys (`storage_path`, `task_list_id`, `scope`, `stale_after_hours`, `session_scoped`, `pollTimeoutMs`) when the canonical `tasks.*` key is absent. See `docs/task-system.md` §3.2.

To clean up, delete the `tasks.enabled` line and drop the two older keys. Nothing else in your file needs to move.

## Hook Names That Still Parse

The four names in the table above remain in `HookNameSchema` (`src/config/schema/hooks.ts:82-88`) as bare literals, and `HOOK_NAME_MAP` in `src/shared/migration/hook-names.ts:14-17` maps each of them to `null`. Two consequences:

- A `disabled_hooks` array that still lists one of them validates, and the entry is stripped from the effective list with a single warn. No `invalid_enum` error, no plugin load failure.
- The names no longer autocomplete to anything that runs. Listing one is the same as listing nothing.

They are scheduled for deletion in v3.0. If you want the warning to stop before then, remove the names from your `disabled_hooks` array.

## Nothing Reads Session Todos Anymore

An earlier draft of this document said two read paths survived the removal, on purpose, so that code inspecting OpenCode's ephemeral todo state would keep getting a meaningful answer instead of a hard error. **That is no longer true.** Every internal read of session todos was removed too. The directive was simple: neither the tools nor the state they carry is mentioned or used anywhere, so there is nothing to read.

What the reads were doing, and what replaced them:

- The session-start deprecation notice is gone. There is no todo state left to warn about.
- The background-task launch check no longer asks whether the session had open todos. It reads the file-backed task store instead, scoped to the calling session, so a background task can only be judged against work actually attributed to that session.
- The `session-manager` diagnostic is the one place the old vocabulary leaks through. It keeps an `include_todos` option, but the name is stale: the option no longer touches todo state. It reads task state for the session, and the argument name was deliberately left alone so the tool's parameter surface does not churn. Expect to see `include_todos` in code and understand it as "include task state".

The scoping that makes this safe is structural, not defensive. Every task record carries a `threadID`, and it is a required field. A task with no session attribution cannot be written at all, so it is invisible to a session-scoped read by construction rather than by a filter someone might later forget to tighten.

## Accepted Behaviour Changes

Two consequences of the above are real and are accepted, not deferred.

**Plan checkboxes with no mission-linked tasks no longer sync.** The `plan-persister` hook reconciles plan checkbox state against the task store. It can only reconcile checkboxes it can tie to a task, and a mission whose checkboxes were never linked to any task has nothing to reconcile against. That mission's plan state stops syncing. The capture path logs this condition when it happens, so the situation is diagnosable from `/tmp/matrixx.log` rather than showing up as a silent divergence.

**A session mid-flight on OpenCode-native todos loses that state.** If you upgrade the plugin while a session still holds open native todos, those todos are simply gone. There is no migration path, and no telemetry path standing in for one. That is a decision, not an oversight. The alternative was keeping a read or a scrape alive purely to observe state the plugin had already decided not to own, and that is exactly the coupling this removal exists to break. If you were mid-task, the file-backed tasks are the record of where you were.

## A Note On The Web Config Editor

`apps/matrixx-config` ships a hand-maintained copy of the JSON schema at `apps/matrixx-config/src/lib/config/schema.json`. It is **not** generated: `script/build-schema.ts` writes only `assets/matrixx.schema.json` and `dist/matrixx.schema.json`. The web editor's copy is therefore out of sync with the plugin, and it still lists hook names the plugin no longer registers. It has been drifting for several releases, independently of this removal. Treat the editor's hook list as approximate and `docs/configurations.md` as authoritative.

## See Also

- `docs/task-system.md` — the surviving system's engineering specification.
- `docs/hooks.md` — surviving hook inventory and execution order.
- `docs/configurations.md` — full config reference, including the retained-deprecated keys.
