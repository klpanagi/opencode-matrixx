/**
 * Poll-timeout outcome helper shared by the sync session poller.
 *
 * When `pollSyncSession` exhausts `maxPollTimeMs` without observing
 * completion, the session is still running server-side. This helper turns
 * that state into a machine-readable, non-throwing outcome string.
 *
 * Mirrors the shape of `src/shared/saturated-outcome.ts`
 * (`formatSaturatedOutcome`): human-readable block plus a trailing
 * `<task_metadata>{JSON}</task_metadata>` line for programmatic parsing.
 */

export const POLL_TIMEOUT_PREFIX = "Poll timeout reached"

export const LAST_ASSISTANT_TEXT_CAP = 2000

export interface PollTimeoutOutcomeArgs {
  sessionID: string
  agentToUse: string
  maxPollTimeMs: number
  lastAssistantText?: string
}

function truncateLastAssistantText(text: string | undefined): string {
  if (!text) return ""
  if (text.length <= LAST_ASSISTANT_TEXT_CAP) return text
  return `${text.slice(0, LAST_ASSISTANT_TEXT_CAP)}...[truncated]`
}

export function formatPollTimeoutOutcome(args: PollTimeoutOutcomeArgs): string {
  const { sessionID, agentToUse, maxPollTimeMs } = args
  const lastAssistantText = truncateLastAssistantText(args.lastAssistantText)
  const metadata = JSON.stringify({
    session_id: sessionID,
    status: "running",
    reason: "poll-timeout",
    agent: agentToUse,
    max_poll_time_ms: maxPollTimeMs,
    last_assistant_text: lastAssistantText,
  })

  const partialOutput = lastAssistantText.length > 0 ? lastAssistantText : "(none)"

  return `${POLL_TIMEOUT_PREFIX} after ${maxPollTimeMs}ms for session ${sessionID}.

Session ID: ${sessionID}
Status: running
Reason: poll-timeout
Agent: ${agentToUse}
Resume: session ${sessionID} is still running; poll again or resume via session ${sessionID}.
Last partial output:
${partialOutput}

<task_metadata>${metadata}</task_metadata>`
}

export function isPollTimeoutOutcome(text: string): boolean {
  return text.startsWith(POLL_TIMEOUT_PREFIX)
}
