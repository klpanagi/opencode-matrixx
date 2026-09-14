# Fix 4 Open Issues (Sync Timeout, Abort, Context-Mode Prompts, BG Handle Persistence)

## TL;DR

> **Quick Summary**: Fix the 4 remaining open issues from the docs/issues/ audit: (A) Oracle→Seraph nested sync stall at the 600s poll limit, (B) sync poll timeout unconditionally aborting the still-running session, (C) subagent prompts authorizing grep/glob/read under `context_mode.enforce:true`, (D, stretch) file-backed background-task handle index mirroring `.matrixx/tasks/`.
>
> **Deliverables**:
> - Authoritative `pollTimeoutMs` wiring + poll-start logging (`timing.ts`, `create-tools.ts`, `sync-session-poller.ts`)
> - No-abort-on-timeout with `session_id` resume path (`sync-task.ts`, poller contract)
> - Oracle background-by-default policy + no-nesting guidance (Oracle prompt/docs)
> - Context-mode-aware prompt utility + Oracle/delegate-task prompt rewrite
> - File-backed `.matrixx/background-tasks/` handle index (after `24a7f333` cause analysis)
> - Regression tests colocated with each fix + full CI green
>
> **Estimated Effort**: Large (9 tasks, ~4 waves)
> **Parallel Execution**: YES - 4 waves (3 / 3 / 2 / 1)
> **Critical Path**: T2 → T4 → T9 (H1 diagnosis → fix → full verification). Second critical leg: T5 → T7 (no-abort → Oracle policy).

---

## Context

### Original Request
Build a high-grade implementation plan to fix 4 remaining open issues in the Matrixx plugin codebase (bugs/gaps from docs/issues/ audit against dev). Plan file at `.matrixx/plans/fix-open-issues.md`. All 4 items must be addressed; Item D must investigate why file persistence was removed (`24a7f333`); Items A and B relationship (shared sync-timeout root) must be explicitly decided (together vs separately); every task needs exact verification commands.

### Interview Summary
**Key Discussions** (requirements were complete on arrival — fast-tracked, no interview rounds needed):
- Scope is fixed: exactly Items A–D, no more, no less.
- Item D is explicitly a stretch goal — plan must still fully design it, execution may defer it last.
- A+B share the sync-timeout code path — plan decides: **fix together in one workstream, sequenced to avoid file conflicts** (B's contract change first, A's policy/budget work builds on it; H1 wiring fix parallelizes freely).
- Test strategy default applied (see Verification Strategy): infrastructure exists → automated tests YES (tests-after, colocated regression tests), Agent-Executed QA mandatory on every task.

**Research Findings**:
- `src/tools/delegate-task/sync-task.ts:157-162` — `finally` unconditionally aborts `syncSessionID` (destroys timed-out sessions; the H2 root cause). Inner poll-error path at `:104-120` returns the timeout string with no session ID for resume.
- `src/tools/delegate-task/sync-session-poller.ts:95-262` — fixed `MAX_POLL_TIME_MS` budget, ~1s polls, 15/10/20-poll stall heuristics, returns timeout string at `:262`. Logs poll start at `:104` (no timing-config values logged — H1 observability gap).
- `src/tools/delegate-task/timing.ts:6,35-37` — `MAX_POLL_TIME_MS = 10*60*1000` default, `setPollTimeoutMs()` setter exists.
- `src/create-tools.ts:30-33` — `resolveTasksConfig(pluginConfig).pollTimeoutMs` → `setPollTimeoutMs`; user config `task.pollTimeoutMs: 900000` was ignored at runtime per issue forensics (stale `dist/` build or load-ordering suspect).
- `src/shared/task-system-gating.ts` — `resolveTasksConfig()` merges canonical `tasks.*` with legacy `morpheus.tasks.*` and `task.pollTimeoutMs` (pure derivation, no mutation).
- `src/hooks/context-mode-enforcer/hook.ts:24-75` — `enforce:true` hard-throws on grep/glob (`BLOCK_MESSAGE_GREP_GLOB`), soft-warns on read; bash `cat|head|tail|grep` patterns intercepted. Constants in `src/hooks/context-mode-enforcer/constants.ts` (BLOCK/WARN messages). Schema `src/config/schema/context-mode.ts`: `enabled(true)/enforce(false)/blocked_tools(["read","grep","glob"])`.
- `src/agents/oracle/plan-generation.ts:67-95` — Oracle→Seraph nested `task(subagent_type="seraph", run_in_background=false)` is unconditional-on-gate inside the blocking Oracle session (the Item A nesting shape). `src/agents/oracle/system-prompt.ts` assembles prompt; `ORACLE_PERMISSION` allows bash/webfetch/question, denies edit.
- `src/features/background-agent/state.ts:5-11` — `TaskStateManager` holds `tasks/notifications/pendingByParent/queuesByKey` in pure memory Maps (the Item D gap).
- `src/features/background-agent/manager.ts` (1773 lines) — `BackgroundManager` orchestration; `src/features/background-agent/constants.ts:4,15` — `TASK_TTL_MS=30min`, `TASK_CLEANUP_DELAY_MS=10min`.
- `src/features/task-storage/` (`storage.ts`, `types.ts`) — file-backed `.matrixx/tasks/T-{uuid}.json` pattern to mirror for Item D.
- Git forensics: `24a7f333` ("remove file persistence, use memory-only", 2025-12-11) removed `background_tasks.json` persist/restore from `manager.ts` citing **race condition with multiple instances** (debounced 500ms `Bun.write` of full task array, no atomic write, no locking). T1 re-verifies this first-hand before designing the replacement.

### Seraph Review
**Bypassed with rationale** (not skipped lightly):
- Complexity scores >=3 (multi-module, cross-cutting) so the gate would normally trigger Seraph.
- The nested-Seraph-under-fixed-budget stall is *the very bug being fixed* (Item A): firing `task(subagent_type="seraph", run_in_background=false)` from this planning session risks reproducing the 600s stall inside plan generation itself.
- Requirements arrived complete (4 items fully specified with key files + suggested directions + verification demands); no critical ambiguity remained that Seraph gap-analysis would unlock.
- Mitigation: the plan bakes Seraph-equivalent guardrails directly into scope boundaries (Must NOT Have section) and per-task exclusions.

---

## Work Objectives

### Core Objective
Eliminate the sync-timeout failure cluster (A+B+H1), make subagent prompts context-mode-safe (C), and restore crash-safe background-handle recovery (D) — each with colocated regression tests and agent-executable verification.

### Concrete Deliverables
- `src/tools/delegate-task/timing.ts` — poll-start config logging support (effective `MAX_POLL_TIME_MS` observable)
- `src/create-tools.ts` + `src/shared/task-system-gating.ts` (if needed) — authoritative `pollTimeoutMs` wiring fix (H1)
- `src/tools/delegate-task/sync-task.ts` — no-abort-on-timeout + session-ID resume path (H2/Item B)
- `src/tools/delegate-task/sync-session-poller.ts` — timeout contract carries session ID; (optionally) provider-error/stall surfacing per H4 if cheap
- `src/agents/oracle/*` — background-by-default policy + no-nesting-under-fixed-budget guidance (Item A)
- New `src/shared/context-mode-prompt.ts` (or equivalent location) — context-mode-aware tool-routing utility + rewritten Oracle/delegate-task prompt templates (Item C)
- `src/features/background-agent/*` — file-backed `.matrixx/background-tasks/` handle index with atomic writes + startup restore + TTL cleanup (Item D)
- Regression tests colocated per fix + `bash script/run-ci.sh` 7/7 green

### Definition of Done
- [ ] `bun run typecheck` clean
- [ ] `bun run lint` clean on all touched dirs
- [ ] Per-fix regression tests pass (`bun test` per-task file)
- [ ] `bash script/run-ci.sh` -> Steps: 7, Passed: 7, Failed: 0
- [ ] No `Poll timeout reached after 600000ms` when `task.pollTimeoutMs` set higher (H1 verified)
- [ ] Timed-out sync session survives and is resumable via `session_id` (H2 verified)
- [ ] Oracle prompt under `enforce:true` contains zero bare grep/glob/read authorizations (H3 verified)
- [ ] Killed-and-restarted manager recovers `bg_*` handles from disk (Item D verified)

### Must Have
- All 4 items addressed in one plan (D may land last as stretch, but designed + implemented, not dropped silently)
- Item D investigation of `24a7f333` removal rationale recorded as evidence before design
- A+B fixed as one workstream with an explicit shared contract (timeout result carries session ID)
- Exact verification commands on every task

### Must NOT Have (Guardrails)
- No PR to `master` — all PRs target `dev`, merge commit only (squash disabled)
- No schema changes to `.matrixx/tasks/T-*.json` or `matrixx.json` without justification (per background-agent issue constraints)
- No generic Write/Edit or bash `sed/echo/cat>` mutations of `.matrixx/plans/*.md` or `.matrixx/tasks/T-*.json` — `plan_*` / `task_*` tools only (task-edit-guard enforced)
- No `as any`, `@ts-ignore`, `@ts-expect-error`, empty catch blocks
- No new `mock.module()` tests without adding to `script/run-ci.sh` + both workflow isolated lists
- No 200+ LOC files created without splitting; no `utils.ts`/`helpers.ts` catch-alls
- No Oracle->Seraph *blocking* nesting reintroduced by the fix itself (policy must forbid what Item A suffered)
- No file-backed index that reintroduces the `24a7f333` multi-instance race (atomic tmp+rename, single-writer or file-per-task design required)
- No human-intervention acceptance criteria — all verification agent-executable

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION.** Every criterion is verifiable by running a command or tool. No "user manually tests", no "visually confirms".

### Test Decision
- **Infrastructure exists**: YES (`bun test` + 246 test files, `bun run typecheck`, `biome lint`, `bash script/run-ci.sh` 7-step CI)
- **Automated tests**: YES (tests-after — colocated regression test per fix task; TDD-RED style repro first where the issue doc mandates reproduce-before-patch, e.g. Item D)
- **Framework**: bun test
- **Agent-Executed QA**: ALWAYS (every task: exact Bash scenarios below; no browser/TUI needed — all deliverables are backend/config/prompt artifacts)

### QA Scenario Format (all tasks)
Bash scenarios with concrete commands, expected outputs, and evidence paths under `.matrixx/evidence/`.

---

## Execution Strategy

### Task Dependency Graph

```
T1 (D history investigation) ------------------> T8 (bg file-backed index)
T2 (H1 wiring diagnosis) ----> T4 (H1 authoritative fix) ----> T9 (full CI/verification)
T3 (prompt audit) ----> T6 (ctx-aware prompt utility+rewrite) ----> T9
T5 (no-abort-on-timeout) ----> T7 (Oracle bg-default + no-nesting policy) ----> T9
T5 ----> T9        T4 ----> T9        T6 ----> T9        T8 ----> T9
```

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| T1 D-history investigation | None | T8 | T2, T3 |
| T2 H1 wiring diagnosis | None | T4 | T1, T3 |
| T3 prompt audit | None | T6 | T1, T2 |
| T4 H1 authoritative fix | T2 | T9 | T5, T6 |
| T5 no-abort-on-timeout | None (contract owner; sequenced before T7) | T7, T9 | T4, T6 |
| T6 ctx-aware prompts | T3 | T9 | T4, T5 |
| T7 Oracle policy | T5 | T9 | T8 |
| T8 bg file-backed index | T1 | T9 | T7 |
| T9 full verification | T4, T5, T6, T7, T8 | None | None (final) |

### Parallel Execution Waves

```
Wave 1 (start immediately, 3 parallel):
  T1: D-history investigation (blue-pill)
  T2: H1 wiring diagnosis (source)
  T3: prompt audit (blue-pill)

Wave 2 (after Wave 1 for T4/T6; T5 free to start, 3 parallel):
  T4: H1 authoritative fix [depends: T2]
  T5: no-abort-on-timeout [depends: none]
  T6: ctx-aware prompt utility + rewrite [depends: T3]

Wave 3 (2 parallel):
  T7: Oracle bg-default + no-nesting policy [depends: T5]
  T8: bg file-backed index [depends: T1]

Wave 4 (final):
  T9: full verification + CI [depends: T4, T5, T6, T7, T8]
```

### Agent Dispatch Summary

| Wave | Tasks | Recommended Dispatch |
|------|-------|----------------------|
| 1 | T1, T2, T3 | 3x `task(run_in_background=true)` in one block, collect via `background_output` |
| 2 | T4, T5, T6 | dispatch after T2/T3 complete (T5 may start early) |
| 3 | T7, T8 | dispatch after T5/T1 complete |
| 4 | T9 | single final verification task |

---

## TODOs

- [ ] 1. Investigate why bg file persistence was removed (Item D forensics)

  **What to do**:
  - Re-read `24a7f333` full diff first-hand: record exactly what persist/restore did (debounced 500ms `Bun.write` of whole task array to single `background_tasks.json`, `restore()` on startup, constructor `storePath` param).
  - Confirm the stated removal reason (race condition with multiple instances) and characterize it: single-file full-array rewrite + debounce timer = last-writer-wins clobbering; no atomic tmp+rename; no locking; Date serialization round-trip fragility.
  - Study the surviving file-backed pattern to mirror: `src/features/task-storage/storage.ts` + `types.ts` (atomic `tmp+renameSync`, per-task `T-{uuid}.json` files, `getTaskDir()` project scoping).
  - Study current `TaskStateManager` and `BackgroundManager` + `BackgroundTask` type.
  - Write findings to `.matrixx/evidence/task-1-bg-persistence-forensics.md`.

  **Must NOT do**: No code changes, no schema changes, no raw grep/glob if context-mode enforced.

  **Category**: `blue-pill` | **Skills**: `[]`

  **Parallel Group**: Wave 1 | **Blocks**: T8 | **Depends**: None

  **Acceptance Criteria**:
  - [ ] Evidence file exists with: removal mechanism, race shape, mirror-pattern description, 4+ design constraints for T8
  - [ ] `bun run typecheck` clean

- [ ] 2. Diagnose H1 pollTimeoutMs wiring (why user config was ignored)

  **What to do**:
  - Trace full wiring: config -> `resolveTasksConfig()` -> `createTools()` -> `setPollTimeoutMs()` -> `getTimingConfig().MAX_POLL_TIME_MS` at poll start
  - Determine cause among suspects: (a) stale `dist/`, (b) load-ordering, (c) key mismatch, (d) instance duplication
  - Record verdict in `.matrixx/evidence/task-2-h1-diagnosis.md`

  **Must NOT do**: No code edits.

  **Category**: `source` | **Skills**: `[software-dev]`

  **Parallel Group**: Wave 1 | **Blocks**: T4 | **Depends**: None

  **Acceptance Criteria**:
  - [ ] Diagnosis names root cause with file:line evidence
  - [ ] Identifies exact T4 edit locations

- [ ] 3. Audit all subagent prompt templates for blocked-tool authorizations

  **What to do**:
  - Collect every prompt template authorizing grep/glob/read/edit/bash-cat for subagents
  - Cross-reference against enforcer semantics
  - Produce table in `.matrixx/evidence/task-3-prompt-audit.md`

  **Must NOT do**: No prompt edits.

  **Category**: `blue-pill` | **Skills**: `[]`

  **Parallel Group**: Wave 1 | **Blocks**: T6 | **Depends**: None

  **Acceptance Criteria**:
  - [ ] Table covers Oracle + delegate-task + dynamic-builder templates
  - [ ] Every row has ctx_* rewrite pointer

- [ ] 4. Make pollTimeoutMs authoritative + log effective budget at poll start

  **What to do**:
  - Implement T2 verdict: fix wiring so `tasks.pollTimeoutMs` takes effect
  - Add poll-start log with effective `MAX_POLL_TIME_MS`
  - Add unit tests: precedence + round-trip

  **Must NOT do**: No abort changes (T5), no prompt changes (T6/T7).

  **Category**: `source` | **Skills**: `[software-dev, tdd-enforcer]`

  **Parallel Group**: Wave 2 (Note: T4+T5 both touch sync-session-poller.ts at disjoint hunks) | **Blocks**: T9 | **Depends**: T2

  **Acceptance Criteria**:
  - [ ] Precedence tests pass
  - [ ] Poll-start log includes effective budget
  - [ ] `bun run typecheck` clean; `bun run lint` clean

  **Commit**: `fix(delegate-task): make pollTimeoutMs authoritative and log effective budget`

- [ ] 5. No-abort-on-timeout with session_id resume path

  **What to do**:
  - Distinguish poll outcomes: timeout -> no abort, return session_id; success -> abort (guard preserved)
  - Update poller contract to carry session ID
  - Handle continuation + fetcher interplay
  - Colocated tests: timeout asserts abort NOT called; success asserts abort IS called

  **Must NOT do**: No Oracle policy (T7), no budget changes (T4).

  **Category**: `source` | **Skills**: `[software-dev, tdd-enforcer]`

  **Parallel Group**: Wave 2 | **Blocks**: T7, T9 | **Depends**: None

  **Acceptance Criteria**:
  - [ ] Timeout tests: abort NOT called, session_id present
  - [ ] Success tests: abort IS called
  - [ ] `bun run typecheck` clean; lint clean on `src/tools/delegate-task/`

  **Commit**: `fix(delegate-task): keep timed-out sync session alive with session_id resume`

- [ ] 6. Context-mode-aware subagent prompts

  **What to do**:
  - Create `src/shared/context-mode-prompt.ts` - routing utility
  - Rewrite templates per T3 audit (Oracle, delegate-task, dynamic-builder)
  - Tests: enforce:true -> ctx-routing; enforce:false -> legacy

  **Must NOT do**: No enforcer hook changes, no schema changes, no Oracle nesting policy.

  **Category**: `source` | **Skills**: `[software-dev, tdd-enforcer]`

  **Parallel Group**: Wave 2 | **Blocks**: T9 | **Depends**: T3

  **Acceptance Criteria**:
  - [ ] Enforce-mode prompt has zero bare grep/glob authorizations
  - [ ] Non-enforce mode unchanged
  - [ ] `bun run typecheck` clean

  **Commit**: `feat(prompts): route subagent tool authorization via context-mode-aware utility`

- [ ] 7. Oracle background-by-default + no-nesting-under-fixed-budget policy

  **What to do**:
  - Change Oracle to `run_in_background=true` by default
  - Replace blocking nested Seraph with sequential top-level calls
  - Document policy in Oracle behavioral summary

  **Must NOT do**: No blocking-nesting reintroduction, no poller budget changes.

  **Category**: `source` | **Skills**: `[software-dev, tdd-enforcer]`

  **Parallel Group**: Wave 3 | **Blocks**: T9 | **Depends**: T5

  **Acceptance Criteria**:
  - [ ] Oracle template contains background-default directive
  - [ ] No blocking nested Seraph call
  - [ ] `bun run typecheck` clean; lint clean on `src/agents/oracle/`

  **Commit**: `fix(oracle): default to background mode and forbid blocking Seraph nesting`

- [ ] 8. File-backed bg handle index mirroring .matrixx/tasks

  **What to do**:
  - Design per T1 constraints (file-per-task, atomic tmp+rename, startup restore, TTL sweep)
  - RED test: handles survive manager re-creation
  - GREEN: implement persistence in TaskStateManager + wire into BackgroundManager lifecycle

  **Must NOT do**: No single-file `background_tasks.json`, no non-atomic writes, no `.matrixx/tasks/` schema changes.

  **Category**: `source` | **Skills**: `[software-dev, tdd-enforcer]`

  **Parallel Group**: Wave 3 | **Blocks**: T9 | **Depends**: T1

  **Acceptance Criteria**:
  - [ ] Grep test asserts no `background_tasks.json` single-file write - only `bg_*.json` + tmp+rename
  - [ ] Manager restart recovers handles
  - [ ] TTL sweep bounded
  - [ ] `bun run typecheck` clean; lint clean on `src/features/background-agent/`

  **Commit**: `feat(background-agent): file-backed bg handle index with atomic writes`

- [ ] 9. Full verification: typecheck, lint, targeted suites, full CI

  **What to do**:
  - Run: typecheck -> lint -> per-fix suites -> `bash script/run-ci.sh`
  - Confirm all 4 DoD behaviors

  **Must NOT do**: No new feature work.

  **Category**: `red-pill` | **Skills**: `[quality-gate]`

  **Parallel Group**: Wave 4 | **Blocks**: None | **Depends**: T4, T5, T6, T7, T8

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` clean
  - [ ] `bun run lint` clean on all touched dirs
  - [ ] `bun test src/tools/delegate-task/ src/features/background-agent/ src/agents/oracle/ src/shared/` PASS
  - [ ] `bash script/run-ci.sh` -> Steps: 7, Passed: 7, Failed: 0
  - [ ] All evidence files present

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| T2+T4 | `fix(delegate-task): make pollTimeoutMs authoritative and log effective budget` | `timing.ts`, `create-tools.ts`, `task-system-gating.ts` (if touched), `sync-session-poller.ts`, tests, T2 evidence | `bun run typecheck && bun test src/tools/delegate-task/` |
| T5 | `fix(delegate-task): keep timed-out sync session alive with session_id resume` | `sync-task.ts`, `sync-session-poller.ts` (if touched), tests | `bun run typecheck && bun test src/tools/delegate-task/` |
| T3+T6 | `feat(prompts): route subagent tool authorization via context-mode-aware utility` | `context-mode-prompt.ts` (new), Oracle + delegate-task + dynamic-builder templates, tests, T3 evidence | `bun run typecheck && bun test src/shared/` |
| T7 | `fix(oracle): default to background mode and forbid blocking Seraph nesting` | `plan-generation.ts`, `behavioral-summary.ts` (if touched), tests/docs | `bun run typecheck && bun test src/agents/oracle/` |
| T1+T8 | `feat(background-agent): file-backed bg handle index with atomic writes` | `background-agent/*`, tests, T1 evidence | `bun run typecheck && bun test src/features/background-agent/` |
| T9 | (no commit - verification only) | - | `bash script/run-ci.sh` 7/7 |

PR discipline: feature branch -> PR targets **`dev`** (never `master`), merge commit only. Each commit message cites the issue doc it resolves.

---

## Success Criteria

### Verification Commands
```bash
bun run typecheck                          # Expected: clean, exit 0
bun run lint                               # Expected: clean on touched dirs
bun test src/tools/delegate-task/ src/features/background-agent/ src/agents/oracle/ src/shared/              # Expected: all PASS
bash script/run-ci.sh                      # Expected: Steps: 7, Passed: 7, Failed: 0
```

### Final Checklist
- [ ] All "Must Have" present (4 items addressed; D forensics recorded; A+B shared contract; exact commands per task)
- [ ] H1: authoritative budget wiring + poll-start log
- [ ] H2: timeout preserves session, success-path abort guard intact
- [ ] H3: enforce-mode prompts route to ctx_* with zero bare grep/glob authorizations
- [ ] Item A: Oracle background-by-default + sequential (non-nested) Seraph flow
- [ ] Item D: restarted manager recovers handles; TTL sweep bounded
- [ ] Full CI 7/7 green

<!-- plan-persister: {"id":"fix-open-issues","updatedAt":"2026-09-14T12:16:42.545Z","sessionId":"ses_f60420400ffe2ZuSbdR6KTDgHS","todoTotal":51,"todoCompleted":0} -->
