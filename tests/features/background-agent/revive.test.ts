/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { classifyRevivable, isRevivableStatus } from "../../../src/features/background-agent/revive"
import {
  formatReviveOutcome,
  formatUnrevivable,
  isUnrevivableReason,
} from "../../../src/shared/revive-outcome"

function extractMetadata(output: string): Record<string, string> {
  const match = output.match(/<task_metadata>(.*)<\/task_metadata>/s)
  if (!match?.[1]) {
    throw new Error("missing <task_metadata> block")
  }
  return JSON.parse(match[1]) as Record<string, string>
}

describe("isRevivableStatus", () => {
  test("returns true for revivable statuses", () => {
    //#given the five revivable statuses
    const statuses = ["cancelled", "stopped", "interrupt", "error", "completed"]
    //#when checking each status
    //#then all are revivable
    for (const status of statuses) {
      expect(isRevivableStatus(status)).toBe(true)
    }
  })

  test("returns false for non-revivable statuses", () => {
    //#given active, uncertain, and unknown statuses
    const statuses = ["pending", "running", "statusUncertain", "bogus"]
    //#when checking each status
    //#then none are revivable
    for (const status of statuses) {
      expect(isRevivableStatus(status)).toBe(false)
    }
  })
})

describe("classifyRevivable with sessionID", () => {
  test("pending with session is active", () => {
    //#given a pending handle with a session
    const handle = { status: "pending", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as active
    expect(result).toEqual({ eligible: false, reason: "active" })
  })

  test("running with session is active", () => {
    //#given a running handle with a session
    const handle = { status: "running", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as active
    expect(result).toEqual({ eligible: false, reason: "active" })
  })

  test("completed with session is eligible", () => {
    //#given a completed handle with a session
    const handle = { status: "completed", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })

  test("error with session is eligible", () => {
    //#given an error handle with a session
    const handle = { status: "error", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })

  test("cancelled with session is eligible", () => {
    //#given a cancelled handle with a session
    const handle = { status: "cancelled", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })

  test("interrupt with session is eligible", () => {
    //#given an interrupt handle with a session
    const handle = { status: "interrupt", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })

  test("stopped with session is eligible", () => {
    //#given a stopped handle with a session
    const handle = { status: "stopped", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })

  test("statusUncertain with session and force false is uncertain", () => {
    //#given a statusUncertain handle with a session and force false
    const handle = { status: "statusUncertain", sessionID: "ses_123" }
    //#when classifying with force false
    const result = classifyRevivable(handle, { force: false })
    //#then it is blocked as uncertain
    expect(result).toEqual({ eligible: false, reason: "uncertain" })
  })

  test("statusUncertain with session and force is eligible", () => {
    //#given a statusUncertain handle with a session and force
    const handle = { status: "statusUncertain", sessionID: "ses_123" }
    //#when classifying with force true
    const result = classifyRevivable(handle, { force: true })
    //#then it is eligible
    expect(result).toEqual({ eligible: true })
  })
})

describe("classifyRevivable without sessionID", () => {
  test("pending without session is still active", () => {
    //#given a pending handle with no session
    const handle = { status: "pending" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then active takes precedence over no-session
    expect(result).toEqual({ eligible: false, reason: "active" })
  })

  test("running without session is still active", () => {
    //#given a running handle with no session
    const handle = { status: "running" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then active takes precedence over no-session
    expect(result).toEqual({ eligible: false, reason: "active" })
  })

  test("completed without session is no-session", () => {
    //#given a completed handle with no session
    const handle = { status: "completed" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("error without session is no-session", () => {
    //#given an error handle with no session
    const handle = { status: "error" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("cancelled without session is no-session", () => {
    //#given a cancelled handle with no session
    const handle = { status: "cancelled" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("interrupt without session is no-session", () => {
    //#given an interrupt handle with no session
    const handle = { status: "interrupt" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("stopped without session is no-session", () => {
    //#given a stopped handle with no session
    const handle = { status: "stopped" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("statusUncertain without session and no force is no-session", () => {
    //#given a statusUncertain handle with no session and no force
    const handle = { status: "statusUncertain" }
    //#when classifying without force
    const result = classifyRevivable(handle)
    //#then no-session takes precedence over uncertain
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("statusUncertain without session and force true is no-session", () => {
    //#given a statusUncertain handle with no session and force true
    const handle = { status: "statusUncertain" }
    //#when classifying with force true
    const result = classifyRevivable(handle, { force: true })
    //#then it is blocked as no-session even with force
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("statusUncertain with blank session and force true is no-session", () => {
    //#given a statusUncertain handle with a blank sessionID and force true
    const handle = { status: "statusUncertain", sessionID: "   " }
    //#when classifying with force true
    const result = classifyRevivable(handle, { force: true })
    //#then it is blocked as no-session even with force
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })
})

describe("classifyRevivable edge cases", () => {
  test("blank-string sessionID is no-session", () => {
    //#given a completed handle with an empty sessionID
    const handle = { status: "completed", sessionID: "" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("whitespace-only sessionID is no-session", () => {
    //#given a completed handle with a whitespace-only sessionID
    const handle = { status: "completed", sessionID: "   " }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as no-session
    expect(result).toEqual({ eligible: false, reason: "no-session" })
  })

  test("unrecognised status is unknown-task", () => {
    //#given a handle with an unrecognised status but a usable session
    const handle = { status: "bogus-status", sessionID: "ses_123" }
    //#when classifying
    const result = classifyRevivable(handle)
    //#then it is blocked as unknown-task
    expect(result).toEqual({ eligible: false, reason: "unknown-task" })
  })
})

describe("formatReviveOutcome", () => {
  test("embeds parseable metadata with expected keys", () => {
    //#given a task id, session id, and status
    const taskId = "bg_123"
    const sessionID = "ses_456"
    const status = "completed"
    //#when formatting the revive outcome
    const output = formatReviveOutcome(taskId, sessionID, status)
    //#then the metadata block parses with the expected keys and values
    expect(output).toContain("Background task revived.")
    const metadata = extractMetadata(output)
    expect(metadata).toEqual({
      task_id: taskId,
      session_id: sessionID,
      status,
      reason: "revived",
    })
  })
})

describe("formatUnrevivable", () => {
  test("without detail embeds parseable metadata", () => {
    //#given a task id and reason with no detail
    const taskId = "bg_123"
    const reason = "active"
    //#when formatting the unrevivable outcome
    const output = formatUnrevivable(taskId, reason)
    //#then the metadata block parses with the expected keys and values
    expect(output).toContain("Background task NOT revived.")
    expect(output).not.toContain("Detail:")
    const metadata = extractMetadata(output)
    expect(metadata).toEqual({
      task_id: taskId,
      status: "unrevived",
      reason,
    })
  })

  test("with detail includes detail line and parseable metadata", () => {
    //#given a task id, reason, and detail string
    const taskId = "bg_123"
    const reason = "uncertain"
    const detail = "liveness could not be determined"
    //#when formatting the unrevivable outcome with detail
    const output = formatUnrevivable(taskId, reason, detail)
    //#then the detail line is present and metadata parses
    expect(output).toContain(`Detail: ${detail}`)
    const metadata = extractMetadata(output)
    expect(metadata).toEqual({
      task_id: taskId,
      status: "unrevived",
      reason,
    })
  })
})

describe("isUnrevivableReason", () => {
  test("returns true for all five reasons", () => {
    //#given the five unrevivable reasons
    const reasons = ["active", "uncertain", "no-session", "unknown-task", "expired"]
    //#when checking each reason
    //#then all return true
    for (const reason of reasons) {
      expect(isUnrevivableReason(reason)).toBe(true)
    }
  })

  test("returns false for junk", () => {
    //#given junk reason strings
    const reasons = ["", "revived", "bogus", "ACTIVE"]
    //#when checking each reason
    //#then all return false
    for (const reason of reasons) {
      expect(isUnrevivableReason(reason)).toBe(false)
    }
  })
})
