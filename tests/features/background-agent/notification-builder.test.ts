/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { buildCompletionNotification } from "../../../src/features/background-agent/notification-builder"
import type { BackgroundTaskStatus } from "../../../src/features/background-agent/types"

const ALL_STATUSES: BackgroundTaskStatus[] = [
  "pending",
  "running",
  "completed",
  "error",
  "cancelled",
  "interrupt",
  "stopped",
  "statusUncertain",
]

const TERMINAL_STATUSES: BackgroundTaskStatus[] = [
  "completed",
  "error",
  "cancelled",
  "interrupt",
  "stopped",
  "statusUncertain",
]

const STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  completed: "COMPLETED",
  interrupt: "INTERRUPTED",
  cancelled: "CANCELLED",
  stopped: "STOPPED",
  statusUncertain: "STATUS UNCERTAIN",
  error: "ERROR",
  pending: "IN PROGRESS",
  running: "IN PROGRESS",
}

function build(status: BackgroundTaskStatus, allComplete = false): string {
  return buildCompletionNotification(
    { id: "task-1", description: "background task", error: undefined, status },
    allComplete,
    [],
    1,
    "1s",
    "",
  )
}

describe("buildCompletionNotification status labels", () => {
  for (const status of ALL_STATUSES) {
    test(`renders the distinct label for ${status}`, () => {
      //#given a task in the ${status} state with no siblings remaining
      //#when building the parent notification for that single task
      const output = build(status)

      //#then the notification header carries the status-specific label
      expect(output).toContain(`[BACKGROUND TASK ${STATUS_LABEL[status]}]`)
    })
  }

  test("maps every terminal status to a distinct label (none collapse into CANCELLED)", () => {
    //#given every terminal status value
    //#when collecting the rendered notification headers
    const labels = TERMINAL_STATUSES.map((status) => {
      const match = build(status).match(/\[BACKGROUND TASK (.+)\]/)
      return match?.[1]
    })

    //#then each terminal status yields its own unique label
    expect(new Set(labels).size).toBe(TERMINAL_STATUSES.length)

    //#and the new terminal outcomes never collapse into the cancelled label
    const stoppedLabel = build("stopped").match(/\[BACKGROUND TASK (.+)\]/)?.[1]
    const uncertainLabel = build("statusUncertain").match(/\[BACKGROUND TASK (.+)\]/)?.[1]
    expect(stoppedLabel).not.toBe("CANCELLED")
    expect(uncertainLabel).not.toBe("CANCELLED")
  })

  test("stopped is not bucketed into CANCELLED", () => {
    //#given a stopped task
    //#when building the notification
    const output = build("stopped")

    //#then it reads STOPPED, never CANCELLED
    expect(output).toContain("STOPPED")
    expect(output).not.toContain("CANCELLED")
  })

  test("statusUncertain is not bucketed into CANCELLED", () => {
    //#given a statusUncertain task
    //#when building the notification
    const output = build("statusUncertain")

    //#then it reads STATUS UNCERTAIN, never CANCELLED
    expect(output).toContain("STATUS UNCERTAIN")
    expect(output).not.toContain("CANCELLED")
  })

  test("uses a generic in-progress label for pending and running", () => {
    //#given the two non-terminal statuses
    //#when building their notifications
    const pending = build("pending")
    const running = build("running")

    //#then both share the generic in-progress label and never claim completion
    expect(pending).toContain("[BACKGROUND TASK IN PROGRESS]")
    expect(running).toContain("[BACKGROUND TASK IN PROGRESS]")
    expect(pending).not.toContain("COMPLETED")
    expect(running).not.toContain("COMPLETED")
  })

  test("allComplete still renders the ALL BACKGROUND TASKS COMPLETE block", () => {
    //#given the final task of a batch reaching a terminal state
    //#when allComplete is true
    const output = build("stopped", true)

    //#then the aggregate-complete block is preserved regardless of status
    expect(output).toContain("[ALL BACKGROUND TASKS COMPLETE]")
    expect(output).not.toContain("[BACKGROUND TASK STOPPED]")
  })
})
