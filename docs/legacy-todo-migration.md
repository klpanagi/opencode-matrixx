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
| `task-notepad` | Kept a notepad file in sync with the session-memory todo list on every todo mutation | `task-notepad-writer`, which writes a notepad file on `task_create` and stamps completion on `task_update` → `completed` |

**Why `task-notepad` went and `task-notepad-writer` took over**: the original hook was removed in commit `f8de08cfb`. Its only data source was `session.todo()`, and that API is gone for good, so there was nothing left to key a notepad on. The replacement hangs off the file-backed task store instead of session memory: it fires on `task_create` to write the notepad, and on `task_update` when the status becomes `completed` to stamp the completion time into the file.

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
- The `session-manager` diagnostic is the one place the old vocabulary leaks through. It keeps an `include_todos` option, but the name is stale: the option no longer touches todo state. Its source is now the file-backed task store, and the argument name was deliberately left alone so the tool's parameter surface does not churn; the name's own deprecation is deferred to v3.0. Expect to see `include_todos` in code and understand it as "include task state". Note that the option reports tasks in whatever state they are in, including `in_progress` ones that have gone untouched past the stale window: the diagnostic's job is to show you the record, so unlike the completion gates it does not filter stale entries out.

The scoping that makes this safe is structural, not defensive. Every task record carries a `threadID`, and it is a required field. A task with no session attribution cannot be written at all, so it is invisible to a session-scoped read by construction rather than by a filter someone might later forget to tighten.

## Accepted Behaviour Changes

Two consequences of the above are real and are accepted, not deferred. A third
behaviour change landed later, in the fix-up pass that followed the migration,
and is recorded here because it corrects a premise the first version of this
document got wrong.

**Plan checkboxes with no mission-linked tasks are still stamped, but nothing to reconcile.** The `plan-persister` hook reconciles plan checkbox state against the task store. It can only reconcile checkboxes it can tie to a task. This document previously said that a mission with no linked task simply stopped being stamped, which is no longer what happens: the zero-vote case used to short-circuit the whole write, so the plan's metadata stamp went stale. The short-circuit is gone. The plan is **always** stamped — `updatedAt`, `sessionId`, and `gitHead` are refreshed — while the **body is left byte-identical**. That is safe because checkbox reconciliation can only ever check a box, never uncheck one: a line with no matching task is returned verbatim, so with zero linked tasks the body write is an identity operation and the stamp is the only thing that changes. The capture path still logs the condition, so the situation is diagnosable from `/tmp/matrixx.log` rather than showing up as a silent divergence.

**A session mid-flight on OpenCode-native todos loses that state.** If you upgrade the plugin while a session still holds open native todos, those todos are simply gone. There is no migration path, and no telemetry path standing in for one. That is a decision, not an oversight. The alternative was keeping a read or a scrape alive purely to observe state the plugin had already decided not to own, and that is exactly the coupling this removal exists to break. If you were mid-task, the file-backed tasks are the record of where you were.

**The background completion gate used to look in the wrong task directory.** The gate that decides whether a background task still has open work resolved the *default* project task directory, so anyone who had configured `tasks.storage_path` or `tasks.scope: "global"` had that gate silently check an empty or unrelated store. The visible symptom was a background task completing at the first idle event, with its own work unfinished. The gate now receives the resolved plugin config and reads the same directory the task tools write to, so a custom or global store behaves like a project one. This was a no-op bug rather than an intended design, which is why it gets a fix and not a compatibility note.

**Plan-to-task linkage is narrow on purpose, and the accepted cost is a stale plan rather than a wrong plan.** `collectLinkedTodos` ties a task to a mission only on a positive signal: the task's `metadata.planName` matches the mission's plan name, its `threadID` is in `mission.session_ids`, or the threadID is absent and the project itself is in scope. A task created in a session that never appeared in `mission.session_ids` and carries no `planName` is therefore unlinked, and because checkbox reconciliation runs per linked task, nothing in the plan gets checked on its behalf. The linkage was **not** widened to close that gap. Widening it would mean another session's tasks could flip another mission's checkboxes, which is a correctness property worth more than a checkbox that updates on its own. The practical effect is contained: the plan keeps whatever checkbox state it already has and still gets a fresh stamp, so it never drifts silently out of date without a trace in the log.

**Two staleness windows, on purpose.** The task store's "no file activity" threshold is not one number. `tasks.stale_after_hours` (default 24) is the `task-continuation-enforcer`'s: a long-running task is normal there and a missed nudge is cheap, so the generous default is correct. `tasks.background_stale_after_hours` (default 2) belongs to the background completion gates only: a task that is still `pending` or `in_progress` with no file activity while its worker has gone is a wedged handle, and holding it `running` blocks the session from ever completing. The key is new, its floor is quarter-hour (`stale_after_hours` was relaxed from whole hours to match), and there is no `stale_after_minutes` companion and no `morpheus.tasks` mirror of it. The separate wall-clock backstop, `background_task.wallClockTimeoutMs`, is deliberately untouched and still defaults to `0` (off).

## A Note On The Web Config Editor

`apps/matrixx-config` ships a hand-maintained copy of the JSON schema at `apps/matrixx-config/src/lib/config/schema.json`. It is **not** generated: `script/build-schema.ts` writes only `assets/matrixx.schema.json` and `dist/matrixx.schema.json`. The web editor's copy is therefore out of sync with the plugin, and it still lists hook names the plugin no longer registers. It has been drifting for several releases, independently of this removal. Treat the editor's hook list as approximate and `docs/configurations.md` as authoritative.

## See Also

- `docs/task-system.md` — the surviving system's engineering specification.
- `docs/hooks.md` — surviving hook inventory and execution order.
- `docs/configurations.md` — full config reference, including the retained-deprecated keys.
