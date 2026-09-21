export const BACKGROUND_OUTPUT_DESCRIPTION = `Get output from background task. Use full_session=true to fetch session messages with filters. System notifies on completion, so block=true rarely needed.`

export const BACKGROUND_CANCEL_DESCRIPTION = `Cancel running background task(s). Use all=true to cancel ALL before final answer.`

export const BACKGROUND_REVIVE_DESCRIPTION = `Revive a retained terminal background task with a NEW instruction.

Call with no arguments (or list=true) to DISCOVER revivable tasks.

Revivable: cancelled, stopped, interrupt, error, completed — provided the task still has a session ID.
Not revivable: pending/running (still active — use background_output), statusUncertain (unknown liveness — pass force=true to acknowledge), and tasks that never produced a session (e.g. queue-saturated).

Handles are retained for 30 minutes, so revive works after a task was pruned or the plugin restarted.`

export const BACKGROUND_WAIT_ALL_DESCRIPTION = `Wait for ALL running/pending background tasks in the current session to complete. Polls until all tasks reach a terminal state or timeout. Use this BEFORE background_cancel(all=true) to allow exploration tasks to finish and return their results.`
