import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  appendSessionId,
  clearMissionState,
  createMissionState,
  getPlanName,
  getPlanProgress,
  readMissionState,
  writeMissionState,
} from "../../../src/features/mission-state/storage"
import {
  NUMBERED_CHECKED_RE,
  NUMBERED_UNCHECKED_RE,
  TOP_CHECKED_RE,
  TOP_UNCHECKED_RE,
} from "../../../src/features/mission-state/constants"
import type { MissionState } from "../../../src/features/mission-state/types"

describe("mission-state", () => {
  const TEST_DIR = join(tmpdir(), `mission-state-test-${Date.now()}`)
  const MATRIX_DIR = join(TEST_DIR, ".matrixx")

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!existsSync(MATRIX_DIR)) {
      mkdirSync(MATRIX_DIR, { recursive: true })
    }
    clearMissionState(TEST_DIR)
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("readMissionState", () => {
    test("should return null when no mission.json exists", () => {
      // given - no mission.json file
      // when
      const result = readMissionState(TEST_DIR)
      // then
      expect(result).toBeNull()
    })

    test("should return null for JSON null value", () => {
      //#given - mission.json containing null
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, "null")

      //#when
      const result = readMissionState(TEST_DIR)

      //#then
      expect(result).toBeNull()
    })

    test("should return null for JSON primitive value", () => {
      //#given - mission.json containing a string
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, '"just a string"')

      //#when
      const result = readMissionState(TEST_DIR)

      //#then
      expect(result).toBeNull()
    })

    test("should default session_ids to [] when missing from JSON", () => {
      //#given - mission.json without session_ids field
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, JSON.stringify({
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        plan_name: "plan",
      }))

      //#when
      const result = readMissionState(TEST_DIR)

      //#then
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual([])
    })

    test("should default session_ids to [] when not an array", () => {
      //#given - mission.json with session_ids as a string
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, JSON.stringify({
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        session_ids: "not-an-array",
        plan_name: "plan",
      }))

      //#when
      const result = readMissionState(TEST_DIR)

      //#then
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual([])
    })

    test("should default session_ids to [] for empty object", () => {
      //#given - mission.json with empty object
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, JSON.stringify({}))

      //#when
      const result = readMissionState(TEST_DIR)

      //#then
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual([])
    })

    test("should read valid mission state", () => {
      // given - valid mission.json
      const state: MissionState = {
        active_plan: "/path/to/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1", "session-2"],
        plan_name: "my-plan",
      }
      writeMissionState(TEST_DIR, state)

      // when
      const result = readMissionState(TEST_DIR)

      // then
      expect(result).not.toBeNull()
      expect(result?.active_plan).toBe("/path/to/plan.md")
      expect(result?.session_ids).toEqual(["session-1", "session-2"])
      expect(result?.plan_name).toBe("my-plan")
    })
  })

  describe("writeMissionState", () => {
    test("should write state and create .matrixx directory if needed", () => {
      // given - state to write
      const state: MissionState = {
        active_plan: "/test/plan.md",
        started_at: "2026-01-02T12:00:00Z",
        session_ids: ["ses-123"],
        plan_name: "test-plan",
      }

      // when
      const success = writeMissionState(TEST_DIR, state)
      const readBack = readMissionState(TEST_DIR)

      // then
      expect(success).toBe(true)
      expect(readBack).not.toBeNull()
      expect(readBack?.active_plan).toBe("/test/plan.md")
    })
  })

  describe("appendSessionId", () => {
    test("should append new session id to existing state", () => {
      // given - existing state with one session
      const state: MissionState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeMissionState(TEST_DIR, state)

      // when
      const result = appendSessionId(TEST_DIR, "session-2")

      // then
      expect(result).not.toBeNull()
      expect(result?.session_ids).toEqual(["session-1", "session-2"])
    })

    test("should not duplicate existing session id", () => {
      // given - state with session-1 already
      const state: MissionState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeMissionState(TEST_DIR, state)

      // when
      appendSessionId(TEST_DIR, "session-1")
      const result = readMissionState(TEST_DIR)

      // then
      expect(result?.session_ids).toEqual(["session-1"])
    })

    test("should return null when no state exists", () => {
      // given - no mission.json
      // when
      const result = appendSessionId(TEST_DIR, "new-session")
      // then
      expect(result).toBeNull()
    })

    test("should not crash when mission.json has no session_ids field", () => {
      //#given - mission.json without session_ids
      const missionFile = join(MATRIX_DIR, "mission.json")
      writeFileSync(missionFile, JSON.stringify({
        active_plan: "/plan.md",
        started_at: "2026-01-01T00:00:00Z",
        plan_name: "plan",
      }))

      //#when
      const result = appendSessionId(TEST_DIR, "ses-new")

      //#then - should not crash and should contain the new session
      expect(result).not.toBeNull()
      expect(result?.session_ids).toContain("ses-new")
    })
  })

  describe("clearMissionState", () => {
    test("should remove mission.json", () => {
      // given - existing state
      const state: MissionState = {
        active_plan: "/plan.md",
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "plan",
      }
      writeMissionState(TEST_DIR, state)

      // when
      const success = clearMissionState(TEST_DIR)
      const result = readMissionState(TEST_DIR)

      // then
      expect(success).toBe(true)
      expect(result).toBeNull()
    })

    test("should succeed even when no file exists", () => {
      // given - no mission.json
      // when
      const success = clearMissionState(TEST_DIR)
      // then
      expect(success).toBe(true)
    })
  })

  describe("getPlanProgress", () => {
    test("should count completed and uncompleted checkboxes", () => {
      // given - plan file with checkboxes
      const planPath = join(TEST_DIR, "test-plan.md")
      writeFileSync(planPath, `# Plan
- [ ] Task 1
- [x] Task 2  
- [ ] Task 3
- [X] Task 4
`)

      // when
      const progress = getPlanProgress(planPath)

      // then
      expect(progress.total).toBe(4)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(false)
    })

    test("should return isComplete true when all checked", () => {
      // given - all tasks completed
      const planPath = join(TEST_DIR, "complete-plan.md")
      writeFileSync(planPath, `# Plan
- [x] Task 1
- [X] Task 2
`)

      // when
      const progress = getPlanProgress(planPath)

      // then
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(true)
    })

    test("should return isComplete true for empty plan", () => {
      // given - plan with no checkboxes
      const planPath = join(TEST_DIR, "empty-plan.md")
      writeFileSync(planPath, "# Plan\nNo tasks here")

      // when
      const progress = getPlanProgress(planPath)

      // then
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
    })

    test("should handle non-existent file", () => {
      // given - non-existent file
      // when
      const progress = getPlanProgress("/non/existent/file.md")
      // then
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
    })

    test("should ignore non-numbered meta checkboxes when numbered tasks present", () => {
      // given - numbered tasks + unnumbered DoD/final-checklist meta checkboxes
      const planPath = join(TEST_DIR, "numbered-plan.md")
      writeFileSync(planPath, `# Plan
- [x] 1. Task A
- [ ] 2. Task B
- [ ] Definition of Done: typecheck clean
- [ ] Final Checklist: full CI green
`)

      // when
      const progress = getPlanProgress(planPath)

      // then - only the 2 numbered tasks count; meta checkboxes ignored
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(1)
      expect(progress.isComplete).toBe(false)
    })

    test("should report complete when all numbered tasks checked despite unchecked meta checkboxes", () => {
      // given - all numbered tasks done, but meta checkboxes still unchecked
      const planPath = join(TEST_DIR, "numbered-complete.md")
      writeFileSync(planPath, `# Plan
- [x] 1. Task A
- [x] 2. Task B
- [ ] Definition of Done: typecheck clean
- [ ] Final Checklist: full CI green
`)

      // when
      const progress = getPlanProgress(planPath)

      // then - isComplete true because all numbered tasks are done
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(true)
    })

    test("should fall back to all top-level checkboxes when no numbered tasks", () => {
      // given - unnumbered tasks (hand-written plan)
      const planPath = join(TEST_DIR, "unnumbered-plan.md")
      writeFileSync(planPath, `# Plan
- [ ] Task 1
- [x] Task 2
- [ ] Task 3
`)

      // when
      const progress = getPlanProgress(planPath)

      // then - all top-level checkboxes counted (backward compatible)
      expect(progress.total).toBe(3)
      expect(progress.completed).toBe(1)
      expect(progress.isComplete).toBe(false)
    })

    test("should ignore indented sub-checkboxes", () => {
      // given - numbered tasks with indented acceptance criteria (Oracle plan format)
      const planPath = join(TEST_DIR, "indented-plan.md")
      writeFileSync(planPath, `# Plan
- [x] 1. Task A

  **Acceptance Criteria**:
  - [ ] Criterion one
  - [ ] Criterion two
- [ ] 2. Task B
`)

      // when
      const progress = getPlanProgress(planPath)

      // then - only the 2 numbered tasks count; indented sub-checkboxes ignored
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(1)
      expect(progress.isComplete).toBe(false)
    })

    test("should handle numbered format variants", () => {
      // given - asterisk bullets, multi-digit numbers, uppercase X, extra whitespace
      const planPath = join(TEST_DIR, "variants-plan.md")
      writeFileSync(planPath, `# Plan
* [x] 1. Asterisk bullet
- [X] 2. Uppercase X
- [ ] 10. Multi-digit number
- [x]   3. Extra whitespace
`)

      // when
      const progress = getPlanProgress(planPath)

      // then
      expect(progress.total).toBe(4)
      expect(progress.completed).toBe(3)
      expect(progress.isComplete).toBe(false)
    })

    test("should report incomplete when no numbered tasks checked", () => {
      // given - numbered tasks, none done
      const planPath = join(TEST_DIR, "numbered-none-done.md")
      writeFileSync(planPath, `# Plan
- [ ] 1. Task A
- [ ] 2. Task B
`)

      // when
      const progress = getPlanProgress(planPath)

      // then
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(0)
      expect(progress.isComplete).toBe(false)
    })

    test("should count mixed numbered, indented, and meta checkboxes as numbered total only", () => {
      //#given - 3 numbered TODOs + 5 indented DoD boxes + 2 unnumbered meta boxes
      const planPath = join(TEST_DIR, "mixed-plan.md")
      writeFileSync(planPath, `# Plan
- [x] 1. First task
- [ ] 2. Second task
- [ ] 3. Third task
- [ ] Definition of Done: typecheck clean
- [ ] Final Checklist: full CI green

## Definition of Done
  - [ ] DoD item one
  - [ ] DoD item two
  - [x] DoD item three
  - [ ] DoD item four
  - [ ] DoD item five
`)

      //#when
      const progress = getPlanProgress(planPath)

      //#then - only the 3 numbered tasks count
      expect(progress.total).toBe(3)
      expect(progress.completed).toBe(1)
      expect(progress.isComplete).toBe(false)
    })

    test("should set needsTriage when plan has no checkboxes", () => {
      //#given - plan with no checkboxes
      const planPath = join(TEST_DIR, "empty-triage-plan.md")
      writeFileSync(planPath, "# Plan\nNo tasks here")

      //#when
      const progress = getPlanProgress(planPath)

      //#then - complete by vacuity, but flagged for triage
      expect(progress.total).toBe(0)
      expect(progress.completed).toBe(0)
      expect(progress.isComplete).toBe(true)
      expect(progress.needsTriage).toBe(true)
    })

    test("should set needsTriage for prose-only plan with nonzero bytes", () => {
      //#given - plan with prose but zero checkboxes
      const planPath = join(TEST_DIR, "prose-only-plan.md")
      writeFileSync(planPath, `# Plan

This plan has plenty of prose describing the work in detail,
but no checkbox lines at all. It needs human triage to decide
whether it is done or was never broken into tasks.
`)

      //#when
      const progress = getPlanProgress(planPath)

      //#then
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
      expect(progress.needsTriage).toBe(true)
    })

    test("should set needsTriage for missing plan file", () => {
      //#given - no file on disk

      //#when
      const progress = getPlanProgress(join(TEST_DIR, "does-not-exist.md"))

      //#then
      expect(progress.total).toBe(0)
      expect(progress.isComplete).toBe(true)
      expect(progress.needsTriage).toBe(true)
    })

    test("should not set needsTriage when checkboxes exist", () => {
      //#given - plan with real checkboxes
      const planPath = join(TEST_DIR, "triage-negative-plan.md")
      writeFileSync(planPath, `# Plan
- [x] 1. Done task
- [ ] 2. Open task
`)

      //#when
      const progress = getPlanProgress(planPath)

      //#then
      expect(progress.total).toBe(2)
      expect(progress.needsTriage).toBe(false)
    })

    test("should count lowercase and uppercase x as completed", () => {
      //#given - mixed [x] and [X] markers on numbered tasks
      const planPath = join(TEST_DIR, "case-plan.md")
      writeFileSync(planPath, `# Plan
- [x] 1. Lowercase done
- [X] 2. Uppercase done
- [ ] 3. Still open
`)

      //#when
      const progress = getPlanProgress(planPath)

      //#then
      expect(progress.total).toBe(3)
      expect(progress.completed).toBe(2)
      expect(progress.isComplete).toBe(false)
    })

    test("should count asterisk-bullet numbered tasks", () => {
      //#given - numbered tasks using * bullets
      const planPath = join(TEST_DIR, "asterisk-plan.md")
      writeFileSync(planPath, `# Plan
* [x] 1. Asterisk done
* [ ] 2. Asterisk open
`)

      //#when
      const progress = getPlanProgress(planPath)

      //#then
      expect(progress.total).toBe(2)
      expect(progress.completed).toBe(1)
      expect(progress.isComplete).toBe(false)
    })
  })

  describe("getPlanName", () => {
    test("should extract plan name from path", () => {
      // given
      const path = "/home/user/.matrixx/plans/project/my-feature.md"
      // when
      const name = getPlanName(path)
      // then
      expect(name).toBe("my-feature")
    })
  })

  describe("createMissionState", () => {
    test("should create state with correct fields", () => {
      // given
      const planPath = "/path/to/auth-refactor.md"
      const sessionId = "ses-abc123"

      // when
      const state = createMissionState(planPath, sessionId)

      // then
      expect(state.active_plan).toBe(planPath)
      expect(state.session_ids).toEqual([sessionId])
      expect(state.plan_name).toBe("auth-refactor")
      expect(state.started_at).toBeDefined()
    })

    test("should include agent field when provided", () => {
      //#given - plan path, session id, and agent type
      const planPath = "/path/to/feature.md"
      const sessionId = "ses-xyz789"
      const agent = "architect"

      //#when - createMissionState is called with agent
      const state = createMissionState(planPath, sessionId, agent)

      //#then - state should include the agent field
      expect(state.agent).toBe("architect")
      expect(state.active_plan).toBe(planPath)
      expect(state.session_ids).toEqual([sessionId])
      expect(state.plan_name).toBe("feature")
    })

    test("should allow agent to be undefined", () => {
      //#given - plan path and session id without agent
      const planPath = "/path/to/legacy.md"
      const sessionId = "ses-legacy"

      //#when - createMissionState is called without agent
      const state = createMissionState(planPath, sessionId)

      //#then - state should not have agent field (backward compatible)
      expect(state.agent).toBeUndefined()
    })
  })

  describe("plan checkbox patterns", () => {
    test("should match top-level unchecked boxes but never indented ones", () => {
      //#given - top-level and indented unchecked lines
      const content = "- [ ] top-level\n* [ ] asterisk top\n  - [ ] indented sub-box"

      //#when
      const matches = content.match(TOP_UNCHECKED_RE) ?? []

      //#then - indented line never counts
      expect(matches).toHaveLength(2)
    })

    test("should match top-level checked boxes case-insensitively but never indented ones", () => {
      //#given - mixed-case checked lines plus an indented checked line
      const content = "- [x] lower\n- [X] upper\n  - [x] indented checked"

      //#when
      const matches = content.match(TOP_CHECKED_RE) ?? []

      //#then
      expect(matches).toHaveLength(2)
    })

    test("should match numbered tasks only, excluding unnumbered meta boxes", () => {
      //#given - numbered tasks alongside unnumbered meta checkboxes
      const content =
        "- [ ] 1. First task\n- [ ] Definition of Done: clean\n- [ ] Final Checklist: green"

      //#when
      const matches = content.match(NUMBERED_UNCHECKED_RE) ?? []

      //#then
      expect(matches).toHaveLength(1)
    })

    test("should match numbered checked tasks case-insensitively, excluding indented lines", () => {
      //#given - numbered checked lines in both cases plus an indented one
      const content = "- [x] 1. Lower done\n- [X] 10. Upper multi-digit\n  - [x] 2. Indented"

      //#when
      const matches = content.match(NUMBERED_CHECKED_RE) ?? []

      //#then
      expect(matches).toHaveLength(2)
    })
  })
})
