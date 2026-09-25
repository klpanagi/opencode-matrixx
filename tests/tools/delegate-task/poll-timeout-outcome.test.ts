/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import {
  formatPollTimeoutOutcome,
  isPollTimeoutOutcome,
  LAST_ASSISTANT_TEXT_CAP,
  POLL_TIMEOUT_PREFIX,
} from "../../../src/shared/poll-timeout-outcome"

// Mirrors the TIMEOUT_ERROR constant in sync-task.test.ts:
// `Poll timeout reached after 600000ms for session test-session-abc`
const LEGACY_TIMEOUT_ERROR =
  "Poll timeout reached after 600000ms for session test-session-abc"

interface PollTimeoutMetadata {
  session_id: string
  status: string
  reason: string
  agent: string
  max_poll_time_ms: number
  last_assistant_text: string
}

function extractMetadataJson(output: string): PollTimeoutMetadata {
  const match = output.match(/<task_metadata>(.*?)<\/task_metadata>/s)
  if (!match) throw new Error("missing <task_metadata> block")
  return JSON.parse(match[1]) as PollTimeoutMetadata
}

describe("formatPollTimeoutOutcome — structured poll-timeout outcome", () => {
  test("output starts with Poll timeout reached prefix", () => {
    //#given
    const args = { sessionID: "ses-123", agentToUse: "mouse", maxPollTimeMs: 600000 }

    //#when
    const output = formatPollTimeoutOutcome(args)

    //#then
    expect(output.startsWith("Poll timeout reached")).toBe(true)
    expect(output.startsWith(POLL_TIMEOUT_PREFIX)).toBe(true)
  })

  test("output contains <task_metadata> with parseable JSON", () => {
    //#given
    const args = { sessionID: "ses-123", agentToUse: "mouse", maxPollTimeMs: 600000 }

    //#when
    const output = formatPollTimeoutOutcome(args)

    //#then
    expect(output).toContain("<task_metadata>")
    expect(output).toContain("</task_metadata>")
    expect(() => extractMetadataJson(output)).not.toThrow()
  })

  test("metadata JSON has correct keys and values", () => {
    //#given
    const args = {
      sessionID: "ses-abc",
      agentToUse: "mouse",
      maxPollTimeMs: 600000,
      lastAssistantText: "partial work",
    }

    //#when
    const output = formatPollTimeoutOutcome(args)
    const metadata = extractMetadataJson(output)

    //#then
    expect(metadata.session_id).toBe("ses-abc")
    expect(metadata.status).toBe("running")
    expect(metadata.reason).toBe("poll-timeout")
    expect(metadata.agent).toBe("mouse")
    expect(metadata.max_poll_time_ms).toBe(600000)
    expect(metadata.last_assistant_text).toBe("partial work")
  })

  test("isPollTimeoutOutcome returns true for structured output", () => {
    //#given
    const output = formatPollTimeoutOutcome({
      sessionID: "ses-123",
      agentToUse: "mouse",
      maxPollTimeMs: 600000,
    })

    //#when
    const result = isPollTimeoutOutcome(output)

    //#then
    expect(result).toBe(true)
  })

  test("backwards compat: legacy bare timeout string still matches", () => {
    //#given
    const legacy = LEGACY_TIMEOUT_ERROR

    //#when
    const result = isPollTimeoutOutcome(legacy)

    //#then
    expect(result).toBe(true)
  })

  test("backwards compat: TIMEOUT_ERROR constant shape matches prefix", () => {
    //#given — the exact constant used in sync-task.test.ts
    const timeoutError = `Poll timeout reached after 600000ms for session test-session-abc`

    //#when
    const matchesPrefix = timeoutError.startsWith(POLL_TIMEOUT_PREFIX)
    const matchesDetector = isPollTimeoutOutcome(timeoutError)

    //#then
    expect(matchesPrefix).toBe(true)
    expect(matchesDetector).toBe(true)
  })

  test("isPollTimeoutOutcome returns false for non-timeout text", () => {
    //#given
    const other = "Session stalled: no assistant response"

    //#when
    const result = isPollTimeoutOutcome(other)

    //#then
    expect(result).toBe(false)
  })

  test("truncates last_assistant_text at 2000 chars", () => {
    //#given
    const longText = "x".repeat(LAST_ASSISTANT_TEXT_CAP + 500)

    //#when
    const output = formatPollTimeoutOutcome({
      sessionID: "ses-123",
      agentToUse: "mouse",
      maxPollTimeMs: 600000,
      lastAssistantText: longText,
    })
    const metadata = extractMetadataJson(output)
    const truncated = metadata.last_assistant_text

    //#then
    expect(LAST_ASSISTANT_TEXT_CAP).toBe(2000)
    expect(truncated.length).toBeLessThan(longText.length)
    expect(truncated).toContain("[truncated]")
    expect(truncated.startsWith("x".repeat(100))).toBe(true)
  })

  test("short text is not truncated", () => {
    //#given
    const shortText = "hello partial"

    //#when
    const output = formatPollTimeoutOutcome({
      sessionID: "ses-123",
      agentToUse: "mouse",
      maxPollTimeMs: 600000,
      lastAssistantText: shortText,
    })
    const metadata = extractMetadataJson(output)

    //#then
    expect(metadata.last_assistant_text).toBe(shortText)
  })
})
