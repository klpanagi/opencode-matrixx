# Oracle Planning Task Self-Abort via 600 s Sync Poll Timeout (2x on 2026-09-13)

## Summary

Two `task(subagent_type="oracle")` invocations (planning the tiers-to-model-presets
refactor) died at the 600 s synchronous poll limit (`Poll timeout reached after
600000ms`). Log forensics on `/tmp/matrixx.log` proves this was **self-abort, not a
model-provider failure**: both Oracle sessions were alive and calling tools for the
entire window; the task tool's poll loop expired and aborted them via
`MessageAbortedError`. A subsequent `background_output(ses_...)` collection attempt
returned `Task not found` — expected behavior, not a second symptom (sync task
sessions are never registered in the background-agent store).

Same signature as `2026-09-12-oracle-seraph-stall.md` (600 s budget binding on Oracle
workloads), but this time the mechanism is fully traced to code. A prior session's
memory claims a `2026-09-13-oracle-poll-timeout-abort.md` report was written — it is
**not on disk**; this file fills that gap with fresh evidence.

No implementation was affected — no plan file was produced; the tiers-to-model-presets
decisions (static bundles, global switch, hard remove) are preserved in conversation.

## Timeline (Europe/Athens, 2026-09-13; log timestamps UTC+3h)

| Time | Event | Evidence |
|------|-------|----------|
| 12:53:13 | User aborts a stuck task (`ses_f65d1ab4`); `session.error` on main session `ses_f65da9ee` | `[task] Aborted by user`, `MessageAbortedError` in log |
| 12:54:30 | Oracle attempt 1 created: `ses_f65cf6b77`, title "Plan tiers-to-presets refactor"; sync poll loop starts | `[task] Invoking onSyncSessionCreated`, `[task] Starting poll loop ... agentToUse: oracle` |
| 12:54:40–45 | Oracle's first tool calls hit the context-mode enforcer: `BLOCKED grep`, `BLOCKED glob` x2 (hard throw, `enforce:true`) | `[context-mode-enforcer] BLOCKED ... ses_f65cf6b77` |
| 12:55:01+ | Oracle falls back to serial `read` calls (soft warnings each) and keeps working | Dozens of `warned on read (soft)` lines |
| 13:04:30 | Attempt 1 poll timeout after 577 polls / 600 s; session aborted | `[task] Poll timeout reached`, then `MessageAbortedError` + abort cascade |
| 13:04:44 | Oracle attempt 2 created: `ses_f65c60d1`; identical shape (`BLOCKED grep/glob` at :51, reads after) | Session-created + enforcer lines |
| 13:14:45 | Attempt 2 poll timeout after 582 polls / 600 s; session aborted | `[task] Poll timeout reached`, abort cascade |
| after each | `background_output(ses_...)` → `Task not found` | Tool output in main session |
| 13:22:40/46 | Two *foreign* trinities launch from the same parent session ("Trace oracle spawn path", "Find session expiry logic") — not launched from this conversation | `[background-agent] launch()` with `parentSessionID: ses_f65da9ee` |
| 13:24:51 | Foreign oracle `bg_23b50fd4` (`ses_f65b39f86`) launched; stuck `busy` with `toolCalls: 0` for 11+ min (still running at 13:35) | `Session still running ... toolCalls:0` every ~3 s |

## Key observations

1. **Both sessions were healthy.** Continuous `read` activity with `hasPending: false`
   progressing normally; zero non-abort errors on either session; zero
   opencode-go/deepseek provider errors (no 4xx/5xx/rate-limit/quota lines) in the
   12:50–13:20 window. The provider-failure hypothesis is **ruled out**.
2. **The killer is the fixed 600 s sync budget.** `sync-session-poller.ts` polls
   `session.status()`/`messages()` ~1/s and returns `Poll timeout reached after
   600000ms` (`MAX_POLL_TIME_MS`, `src/tools/delegate-task/timing.ts:6`); the
   `finally` in `executeSyncTask` then **aborts the still-running session**
   (`src/tools/delegate-task/sync-task.ts:157-162`), destroying in-flight inference.
3. **`task.pollTimeoutMs: 900000` in the user config was ignored.** The user config
   sets 15 min, but both runs died at exactly 600000 ms. Wiring exists
   (`src/create-tools.ts:29-30` → `setPollTimeoutMs`, `timing.ts:35-37`), so either
   the running plugin build predates it or config load ordering defeats it — prime
   suspect, see H1.
4. **Prompt/tooling mismatch burned the budget.** The Oracle prompt authorized
   "Read, Glob, Grep", but user config has `context_mode.enforce: true` with
   `blocked_tools: [grep, glob, read, edit]` — grep/glob **throw** inside subagents.
   Oracle lost its opening minutes on blocked calls, then crawled a 20+ file
   inventory via serial warned reads. A planning workload cannot fit in 600 s under
   those conditions.
5. **`Task not found` is a red herring.** Sync task sessions live only in the poll
   loop, never in the background-agent `tasks` map; `background_output` looks up
   that map (`create-background-output.ts:68`), so `background_output(ses_...)`
   can never resolve. After the abort, nothing is recoverable via that path.
6. **Poll loop is blind to provider state.** It only reads session status/messages —
   a genuinely stalled provider would burn the same 600 s with no early exit (only
   the 15-idle-poll stall heuristic exists). Relevant to the foreign `bg_23b50fd4`
   hang (`toolCalls: 0`, busy 11+ min), which has a *different* signature from our
   two attempts and may be a genuine stall — or another window's run.
7. **Fallback chain is a no-op here.** Oracle's `fallbackChain` is
   opencode-go/deepseek-v4-flash → same model; spawn-time only, no mid-session
   retry. Not causal this time, but it means a real provider outage would also
   present as a hang-then-timeout.

## Hypotheses (for the follow-up session)

- H1: `setPollTimeoutMs` wiring (`create-tools.ts:29-30`) doesn't take effect at
  runtime (stale `dist/` build or config-load ordering) — verify by logging
  `MAX_POLL_TIME_MS` at poll start; fix makes `task.pollTimeoutMs` authoritative.
- H2: `executeSyncTask`'s `finally` abort (`sync-task.ts:157-162`) should not kill
  the session on poll timeout — leave it running and return the session ID for
  later collection via `session_id` continuation.
- H3: Subagent prompts must be generated context-mode-aware: never authorize
  grep/glob/read for agents running under `enforce:true`; route them to
  `ctx_*`/trinity-operator instead.
- H4: Add provider-error/stall detection to `sync-session-poller.ts` (surface
  `session.error` and message-error states as immediate returns instead of burning
  the full budget).
- H5: Confirm ownership of the 13:22–13:24 foreign launches (second user window?
  automated continuation?). If `bg_23b50fd4` is still busy with 0 tool calls,
  `session_read` it — a second, distinct hang signature is valuable data.

## Impact

- No code or data loss: no plan file existed to lose; tier-inventory findings from
  the report phase were already delivered in conversation.
- Cost: ~20 min wall-clock on two doomed Oracle runs + this forensics pass.
- The tiers-to-model-presets refactor is unblocked on process: next Oracle
  invocation should use `run_in_background=true` (or a raised `pollTimeoutMs`
  once H1 is fixed) with a context-mode-aware prompt.

## Suggested next steps (future session)

1. Verify H1 first (one-line log + config/build check) — cheapest fix with the
   biggest payoff for all long agents.
2. Re-fire Oracle for `.matrixx/plans/tiers-to-model-presets.md` in background
   mode with a prompt that forbids grep/glob and points at `ctx_batch_execute`.
3. Implement H2 (no abort-on-timeout) so partial Oracle work survives via
   `session_id` resume instead of being destroyed.
4. Resolve the `bg_23b50fd4` mystery (H5) before concluding — if it never produces
   a first tool call, file it as a separate provider-delivery issue.
5. Consider policy: Oracle always in background mode; blocking `task()` reserved
   for sub-minute agents.
