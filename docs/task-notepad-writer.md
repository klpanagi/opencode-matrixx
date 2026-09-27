# Task Notepad Writer

`task-notepad-writer` is a `tool.execute.after` hook that gives every file-backed task a plain-markdown working
notepad on disk. When an agent creates a task, the hook writes a scaffolded note next to the plan it belongs to.
When that task later completes, the hook appends a completion stamp. Nothing else reads or renders these files;
they exist so findings survive compaction, restarts, and handoffs.

For the task substrate itself, see [task-system.md](./task-system.md). For the full per-hook table, see
[hooks.md](./hooks.md).

## What it does and when it fires

| Tool | Condition | Effect |
|---|---|---|
| `task_create` | The result is not `deduplicated`, and the task is readable in the file-backed store | Writes one scaffold file into the resolved bucket |
| `task_update` | The returned task's `status === "completed"` | Appends the `## Completion` stamp to that task's notepad, if one exists |
| anything else | — | Nothing. The hook returns without touching the filesystem |

It never blocks a tool call. It never modifies tool output. Every failure path is a log line, never a thrown
error, so a broken notepad write cannot take down the task that triggered it.

A `task_update` that sets any other status (`in_progress`, `pending`, `deleted`) writes nothing at all. The
scaffold stays byte-identical until something marks the task completed.

## Two-bucket layout

Every notepad lives under `.matrixx/notepads/`. There are exactly two kinds of bucket:

- Plan bucket: `.matrixx/notepads/<planName>/<n>-<slug>.md`
- Adhoc bucket: `.matrixx/notepads/adhoc/<n>-<slug>.md`

`.matrixx/` is gitignored, so notepads are per-clone working state, not source.

### The resolution rule

The plan bucket is taken only when **both** conditions hold:

1. `metadata.planName` is present on the task and is a non-empty string, and
2. the plan file `.matrixx/plans/<planName>.md` actually exists on disk.

Anything else resolves to `adhoc`. The implementation reports which of the three reasons applied
(`plan-file-exists`, `no-plan-name`, or `plan-file-missing`).

There is **no mtime or recency fallback**. When `planName` is absent or dangling, the hook does not scan
`.matrixx/plans/` to find the most recently modified plan and guess. That is deliberate. A guessed bucket
attaches a task's notes to an unrelated plan, and the mistake is invisible afterwards: the file looks exactly
like a correctly filed one. Falling back to `adhoc` is loud instead, since the notepad visibly sits outside
any plan directory.

## Why the layout is flat, and why it matters

Inside a bucket, notepad files sit directly in the directory. There is no `tasks/` subdirectory, and there
cannot be one.

Three consumers read notepads with a non-recursive glob over `{plan-name}/*.md`:

| Consumer | Line | Pattern |
|---|---|---|
| `src/hooks/architect/verification-reminders.ts` | 33 | `Glob(".matrixx/notepads/${planName}/*.md")` |
| `src/agents/architect/default.ts` | 160 | `glob(".matrixx/notepads/{plan-name}/*.md")` |
| `src/agents/architect/gpt.ts` | 124 | `READ: .matrixx/notepads/{plan-name}/*.md` |

A non-recursive glob stops at the first directory level. If the writer nested its output as
`.matrixx/notepads/<planName>/tasks/<n>-<slug>.md`, all three consumers would silently read zero notepads
and the architect would verify against nothing. Flatness is a contract with those readers, not a style
preference.

The live precedent is the repo's own `.matrixx/notepads/fix-111-architect/` bucket:

```
0-recon.md  1-gate1.md  2-gate2.md  3-gate3.md
4-gate4.md  4-recon.md  5-resolver.md  6-verify.md
```

Note the shape: flat, an integer prefix, the prefix is **not** zero-padded, and the rest is a kebab-case slug.

## Filename convention

```
<n>-<slug>.md
```

- `<n>` is the index, and the index is simply the count of existing `*.md` files in that bucket at write
  time. An empty bucket yields `0`, a bucket with two files yields `2`. There is no reordering, no gap-filling
  and no reuse of freed slots.
- `<slug>` comes from the task subject: lowercased, every run of non-alphanumeric characters collapsed to a
  single `-`, leading and trailing hyphens trimmed, then cut to 60 characters with any trailing hyphen removed
  again. A subject that slugifies to nothing falls back to the task id.
- Zero padding is not used. `0-`, `1-`, `10-` sorts correctly as plain strings anyway, and the writer has no
  reason to widen its names.

So `Fix the Flaky Test!!` becomes `0-fix-the-flaky-test.md`.

## Scaffold structure

The scaffold is a header block followed by four empty sections:

```markdown
# Task: <subject>

**Task ID**: <task id>
**Priority**: <priority, or medium>
**Status**: <status, or pending>
**Started**: <ISO-8601 timestamp>

## Findings

(Record what you learn about this code as you work — patterns, conventions, gotchas, useful references.)

## Blockers

(Anything blocking progress. Be specific: file path, line, error, workaround if any.)

## Questions

(Open questions to revisit later. Don't lose them when context compacts.)

## Results

(Summary on completion. What changed, what was verified, what remains.)
```

The completion stamp is three lines appended to the end of the file:

```markdown
## Completion
- completed_at: <ISO-8601 timestamp>
- status: completed
```

Both blocks are written by the hook; the agent never has to author the header.

## Idempotency

The hook keeps no in-memory map of what it has written. A new hook instance is built for every tool call, so
any in-process cache would be empty on the next call and after any restart. Both idempotency checks are
therefore keyed on markers that live in the file itself.

**Scaffold idempotency** is keyed on the durable `**Task ID**` marker. Before writing, the hook scans the
candidate bucket's `*.md` files and looks for a line whose trimmed content is exactly
`**Task ID**: <task id>`. A hit means the notepad already exists, and the write is skipped. The candidate
bucket is the plan bucket if the task has a `planName`, with `adhoc` always tried as well, so a task whose plan
appeared (or disappeared) between calls is still found.

**Stamp idempotency** is keyed on the presence of an existing `**Status**: completed` marker. If the file
already contains a `## Completion` heading, the stamp is not appended again.

Neither check can be defeated by a task firing twice, a tool call being retried, or the plugin reloading.

## The create/update asymmetry

The two entry points get their data from different places, and the reason is worth stating plainly.

`task_create`'s output envelope carries only `{ id, subject }` per created task. It has **no `status` and no
`metadata`**. So the create path cannot learn `metadata.planName` from the tool output, and without it the hook
cannot pick a bucket. That path therefore reads the task back out of the file-backed store, using
`getTaskDir(config, directory)` to resolve the task directory and `readJsonSafe(path, TaskObjectSchema)` to
parse and validate the record. The stored record is what supplies `metadata`, `status` and `priority`.

`task_update` returns the full `TaskObject`, metadata included, so it needs no store read. The store read there
is only a fallback for a payload that arrives without `metadata`.

The asymmetry is a property of the create tool's response shape, not an inconsistency in the hook. If
`task_create` ever started echoing `metadata` back, the store read would become redundant.

If the create path cannot find the task in the store, it logs `task not in store yet, no notepad written` and
writes nothing. A missing notepad is a far smaller problem than a misfiled one.

## Relationship to the retired hook

This hook replaces `task-notepad`, which was removed in commit `f8de08cfb`. The old hook was built on
`session.todo()`, and that data source is permanently unavailable, so there was nothing left to key on.

`task-notepad` is still accepted as a literal in the hook-name schema, retained purely so existing
configurations do not fail validation. It is not a hook name you may reuse: a config entry naming it silently
does nothing. The literal goes away in v3.0.

## How to disable

Either the config key or the programmatic gate:

```jsonc
{
  "disabled_hooks": ["task-notepad-writer"]
}
```

```ts
isHookEnabled("task-notepad-writer")
```

Both paths end at the same `safeCreateHook` wrapper, so a disabled hook is never constructed at all.

## Worked Examples

Everything below is real captured output. It was produced by driving the actual
`createTaskNotepadWriterHook` factory from `src/hooks/task-notepad-writer/index.ts` inside a `mkdtemp` fixture
root, so no real project directory was touched. The full capture is at
`.matrixx/evidence/task-11-examples.txt`.

### Example A: the plan-bucket happy path

A task is created with `metadata.planName` pointing at a plan file that exists. The notepad lands in the plan
bucket, the agent fills in the sections, and completing the task appends the stamp.

**Step 0.** Seed a live plan so the plan bucket is eligible. The fixture writes
`.matrixx/plans/auth-refresh.md`.

**Step 1.** `task_create` with `metadata.planName = "auth-refresh"`. The tool returns only the id and subject:

```json
{"tasks":[{"id":"T-3f1c9a20-8d4e-4b77-9c11-5a0e2b6d4f10","subject":"Rotate the refresh-token signing key"}],"errors":[]}
```

Because that envelope has no `metadata`, the hook reads `.matrixx/tasks/T-3f1c9a20-....json` from the store to
learn the plan name, resolves the plan bucket, and writes:

```text
→ wrote .matrixx/notepads/auth-refresh/0-rotate-the-refresh-token-signing-key.md
```

The file, verbatim:

```markdown
# Task: Rotate the refresh-token signing key

**Task ID**: T-3f1c9a20-8d4e-4b77-9c11-5a0e2b6d4f10
**Priority**: high
**Status**: pending
**Started**: 2026-09-27T16:20:10.393Z

## Findings

(Record what you learn about this code as you work — patterns, conventions, gotchas, useful references.)

## Blockers

(Anything blocking progress. Be specific: file path, line, error, workaround if any.)

## Questions

(Open questions to revisit later. Don't lose them when context compacts.)

## Results

(Summary on completion. What changed, what was verified, what remains.)
```

**Step 2.** The agent appends notes under the existing headings. The hook is not involved in this step.

**Step 3.** `task_update` sets `status: completed`:

```json
{"task":{"id":"T-3f1c9a20-8d4e-4b77-9c11-5a0e2b6d4f10","subject":"Rotate the refresh-token signing key","status":"completed"}}
```

This payload does carry the full task, so no store read is needed. The hook finds the notepad by its
`**Task ID**` marker and appends the stamp. The file, verbatim:

```markdown
# Task: Rotate the refresh-token signing key

**Task ID**: T-3f1c9a20-8d4e-4b77-9c11-5a0e2b6d4f10
**Priority**: high
**Status**: pending
**Started**: 2026-09-27T16:20:10.393Z

## Findings

(Record what you learn about this code as you work — patterns, conventions, gotchas, useful references.)

## Blockers

(Anything blocking progress. Be specific: file path, line, error, workaround if any.)

## Questions

(Open questions to revisit later. Don't lose them when context compacts.)

## Results

(Summary on completion. What changed, what was verified, what remains.)

## Completion
- completed_at: 2026-09-27T16:20:10.394Z
- status: completed
```

Read the ending closely: the `**Status**: pending` header line stays `pending` forever. Completion is recorded
only in the appended stamp, never by rewriting the header.

### Example B: the adhoc fallback

Two tasks are created in a fixture root that has no `.matrixx/plans` directory at all. The first carries
`metadata.planName = "auth-refresh"`; the second carries no metadata at all. Both fall through to `adhoc`:

```text
Step 1 — metadata.planName = "auth-refresh", but NO plan file was ever written.
No .matrixx/plans directory exists in this fixture root at all.
  resolved bucket: adhoc (reason: plan-file-missing)
  → wrote .matrixx/notepads/adhoc/0-document-the-flaky-111-architect-gate.md

Step 2 — a task with no metadata at all.
  resolved bucket: adhoc (reason: no-plan-name)

Final adhoc listing (index increments by the count of existing *.md):
  .matrixx/notepads/adhoc/0-document-the-flaky-111-architect-gate.md
  .matrixx/notepads/adhoc/1-spike-the-notepad-bucket-naming.md

No plan bucket was created anywhere:
  .matrixx/notepads/adhoc
```

Note the second listing: even though `auth-refresh` had no plan file, the writer created no
`auth-refresh/` bucket. An empty or speculative plan directory would be a trap for the architect's glob.

The first adhoc file, verbatim:

```markdown
# Task: Document the flaky 111 architect gate

**Task ID**: T-77b2c4d6-1e3f-4a58-8b90-c1d2e3f40516
**Priority**: medium
**Status**: pending
**Started**: 2026-09-27T16:20:10.394Z

## Findings

(Record what you learn about this code as you work — patterns, conventions, gotchas, useful references.)

## Blockers

(Anything blocking progress. Be specific: file path, line, error, workaround if any.)

## Questions

(Open questions to revisit later. Don't lose them when context compacts.)

## Results

(Summary on completion. What changed, what was verified, what remains.)
```

This is a deliberate fallback, not an error state. No warning is surfaced, nothing fails, and the task
proceeds exactly as it would have otherwise. The practical consequence: a notepad sitting in `adhoc/` is
your signal that the task's `metadata.planName` was missing or that the plan file had not been created yet.
Fix the metadata and the notepad is still findable, because the `**Task ID**` lookup tries `adhoc` as well as
the plan bucket.

No recency scan is performed in either case. The hook does not list `.matrixx/plans/` to guess which plan
the task belonged to.

### Example C: idempotency under retry

This is the property that matters most operationally, so here is the measurement rather than the claim. One
create and one completed update are fired, then **both are fired again**. Every fire builds a brand-new hook
instance, so nothing can be suppressed by in-process state.

```text
Round 1 — bucket listing after one create + one completed update:
  .matrixx/notepads/auth-refresh/0-rotate-the-refresh-token-signing-key.md

Round 1 — file size and sha256:
  bytes: 646
  sha256: 7c8cbfb83f872bea01ac17c27de3e96ae02673e1aa2c40b3042ca5aff3948226
  "## Completion" occurrences: 1

Round 2 — repeat BOTH calls. Each fire() builds a brand-new hook instance,
so nothing can be deduplicated by in-memory state.

Round 2 — bucket listing after the repeat:
  .matrixx/notepads/auth-refresh/0-rotate-the-refresh-token-signing-key.md

Round 2 — file size and sha256:
  bytes: 646
  sha256: 7c8cbfb83f872bea01ac17c27de3e96ae02673e1aa2c40b3042ca5aff3948226
  "## Completion" occurrences: 1

byte-identical: true
file count unchanged: true
```

The hash is the same in both rounds and the completion count stays at 1. The second `task_create` found the
existing `**Task ID**` marker and skipped the write, so it did not consume a new index; the second completed
`task_update` found the existing `## Completion` heading and skipped the append.

Had either check been missing, round 2 would show `1-rotate-...md` as a second file and a duplicated stamp.

## Implementation map

| Concern | File |
|---|---|
| Exact scaffold, stamp, and marker literals | `src/hooks/task-notepad-writer/constants.ts` |
| Bucket rule, slug, index, `**Task ID**` lookup | `src/hooks/task-notepad-writer/notepad-path.ts` |
| Dispatch conditions and the store read | `src/hooks/task-notepad-writer/hook.ts` |
| `getTaskDir` / `readJsonSafe` | `src/features/task-storage/storage.ts` |
| Fence tests | `tests/hooks/task-notepad-writer/hook.test.ts` |
