# BACKGROUND AGENT KNOWLEDGE BASE

## OVERVIEW

Background agent subsystem manages long-running AI subagent execution outside the foreground session lifecycle. Handles task creation, queue admission, concurrency enforcement via model-level semaphores, monitoring/polling loops, stale timeout termination, completion notifications, disk-backed handle persistence, restart reconciliation across host restarts, bounded wall-clock execution timeouts, session revive from persisted handles, and circuit breaker protection against tool-use loops. ~33 files, ~5600 LOC; `manager.ts` (2165 lines) is the single point of orchestration.

## STRUCTURE

```
background-agent/
├── manager.ts              # Main task orchestration (2165 lines, grandfathered over 200-LOC limit)
├── types.ts                # BackgroundTask, LaunchInput, terminal reason types
├── constants.ts            # Defaults: concurrency, timeouts, polling intervals, wallclock
├── concurrency.ts          # ConcurrencyManager — per-model semaphores + wait queues
├── reconcile.ts            # Restart reconciliation — classifies persisted running/pending handles
├── admission.ts            # Nested-admission classifier (`classifyAdmission`)
├── loop-detector.ts        # Circuit breaker — repetitive tool-use detection (sliding window)
├── handle-index.ts         # File-backed handle index (atomic tmp+renameSync writes)
├── revive.ts               # Session revive — revivable-set classifier + handle rehydration
├── error-helpers.ts        # Error message extraction helpers
├── notification-builder.ts # Completion notification formatting
├── session-output.ts       # Assistant output validation (prevents zombie background tasks)
├── task-history.ts         # Per-session task history tracking
├── message-dir.ts          # Per-task message directory management
├── notification-builder.ts # Structured notification building
└── state.ts                # Task state serialization helpers
```

## KEY PATTERNS

**Supervisor Lifecycle:** On launch, `LaunchInput` → queue admission (bounded by `admissionTimeoutMs`, default unbounded) → nested-admission classification (default bypasses semaphore) → acquire model-level concurrency slot → spawn subprocess → poll loop every `POLLING_INTERVAL_MS` checking for assistant output / stale inactivity → on terminal status, record to handle-index, send completion notification, sweep stale handles if TTL exceeded. The manager runs exactly one polling goroutine per active task using a Map keyed by `taskId`.

**Wallclock Enforcement:** `wallClockTimeoutMs` defaults to `0` (OFF). Any non-zero value sets a hard upper bound (union type: exactly `0` or ≥60000). When exceeded, the task is terminated with `terminalReason: "wallclock-timeout"`. `wallClockAbortGraceMs` (default 5000ms) provides a grace period between timeout fire and actual abort signal, allowing graceful flush. Zero means no grace — immediate kill. This is applied uniformly to all agents regardless of category.

**Concurrency Model:** Hierarchical — `modelConcurrency` overrides `providerConcurrency` which overrides `defaultConcurrency`. Each concurrent group uses an independent `Semaphore` with waiters queued FIFO. Acquisition respects `admissionTimeoutMs` deadline; timeout expires yields terminal `stopped` with `terminalReason: "queue-saturated"`. Concurrency is NOT re-acquired on restart reconciliation — already-running slots are preserved.

**Handle Persistence:** All tasks written atomically to `<project>/.matrixx/bg-handles/<taskId>.json` via temp+renameSync. Handles tracked in-memory Set bounded by `TASK_TTL_MS` (30 min). `sweepStaleHandles()` removes expired entries to prevent unbounded growth. On startup, `restoreHandles()` reconciles each persisted handle against the live tmux host.

**Circuit Breaker:** Sliding window (configurable `maxToolCalls` default 75) detects repetitive tool usage via `detectRepetitiveToolUse()`. Consecutive failures above `consecutiveThreshold` (default 3) trip the breaker, preventing runaway tool calls. Configurable per-feature via `{ enabled, maxToolCalls, consecutiveThreshold }`.

## TERMINAL REASONS

`BackgroundTerminalReason` enum: `queue-saturated | no-output | uncertain | aborted | stale | nested-depth-exceeded | wallclock-timeout`. Persisted on `BgHandleSchema.terminalReason` for post-mortem analysis.
