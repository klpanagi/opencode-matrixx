/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { buildCompletionNotification, buildJobBoardNotification } from "../../../src/features/background-agent/notification-builder"
import { TaskHistory } from "../../../src/features/background-agent/task-history"
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

describe("buildJobBoardNotification", () => {
  test("wraps the latest snapshot in the system-reminder envelope with the retrieval hint", () => {
    //#given a history with one completed task
    const history = new TaskHistory()
    history.record("parent-1", { id: "t1", agent: "explore", description: "Find auth", status: "completed" })
    const snapshot = history.buildJobBoardSnapshot("parent-1")

    //#when building the job-board notification
    const output = buildJobBoardNotification(snapshot!)

    //#then the envelope, board header, content, and retrieval hint are present
    expect(output).toContain("<system-reminder>")
    expect(output).toContain("[BACKGROUND TASK BOARD]")
    expect(output).toContain("Find auth")
    expect(output).toContain('background_output(task_id="<id>")')
  })

  test("checkpoint snapshots use the checkpoint header", () => {
    //#given a history with one completed task
    const history = new TaskHistory()
    history.record("parent-1", { id: "t1", agent: "explore", description: "Find auth", status: "completed" })
    const snapshot = history.buildJobBoardSnapshot("parent-1", { strategy: "checkpoint-compatible" })

    //#when building the job-board notification
    const output = buildJobBoardNotification(snapshot!)

    //#then the checkpoint header marks the append-only entry
    expect(output).toContain("[BACKGROUND TASK BOARD CHECKPOINT]")
  })

  test("completion notification unchanged for existing fixtures", () => {
    //#given a completed task with siblings listed
    const output = buildCompletionNotification(
      { id: "task-1", description: "background task", error: undefined, status: "completed" },
      true,
      [{ id: "task-1", description: "background task" }],
      0,
      "1s",
      "",
    )

    //#then the golden all-complete block is byte-identical
    expect(output).toBe(`<system-reminder>
[ALL BACKGROUND TASKS COMPLETE]

**Completed:**
- \`task-1\`: background task

Use \`background_output(task_id="<id>")\` to retrieve each result.
</system-reminder>`)
  })

  test("allComplete truncates the completed list to 5 with a +N more line", () => {
    //#given 8 completed sibling tasks
    const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `task-${i + 1}`, description: `Task ${i + 1}` }))
    //#when building the all-complete notification
    const output = buildCompletionNotification(
      { id: "task-1", description: "background task", error: undefined, status: "completed" },
      true,
      tasks,
      0,
      "1s",
      "",
    )
    //#then only the 5 most recent tasks are listed and the rest collapse into a count line
    expect(output).toContain("- `task-4`: Task 4")
    expect(output).toContain("- `task-8`: Task 8")
    expect(output).not.toContain("- `task-1`: Task 1")
    expect(output).not.toContain("- `task-2`: Task 2")
    expect(output).not.toContain("- `task-3`: Task 3")
    expect(output).toContain("- ... +3 more tasks")
  })
})
