import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  readMissionState,
  rotateMissionIfComplete,
  writeMissionState,
} from "../../../src/features/mission-state/storage"
import type { MissionState } from "../../../src/features/mission-state/types"

describe("mission-state rotation", () => {
  let testDir: string
  let matrixDir: string

  function writePlan(name: string, content: string): string {
    const plansDir = join(testDir, ".matrixx", "plans")
    mkdirSync(plansDir, { recursive: true })
    const planPath = join(plansDir, name)
    writeFileSync(planPath, content)
    return planPath
  }

  function writeLegacyMission(planPath: string, sessionId: string): void {
    const missionFile = join(matrixDir, "mission.json")
    writeFileSync(
      missionFile,
      JSON.stringify({
        active_plan: planPath,
        started_at: "2026-01-01T00:00:00Z",
        session_id: sessionId,
        plan_name: "legacy-plan",
      }),
    )
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `mission-rotation-test-${randomUUID()}`)
    matrixDir = join(testDir, ".matrixx")
    mkdirSync(matrixDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("readMissionState legacy normalization", () => {
    test("normalizes legacy single session_id to session_ids array", async () => {
      //#given - mission.json with legacy singular session_id
      const planPath = writePlan("legacy-plan.md", "# Legacy\n- [ ] 1. Work")
      writeLegacyMission(planPath, "ses-legacy-1")

      //#when
      const state = readMissionState(testDir)

      //#then - normalized in memory without rewriting the file
      expect(state).not.toBeNull()
      expect(state?.session_ids).toEqual(["ses-legacy-1"])
      const raw = JSON.parse(
        (await import("node:fs")).readFileSync(join(matrixDir, "mission.json"), "utf-8"),
      )
      expect(raw.session_id).toBe("ses-legacy-1")
      expect(raw.session_ids).toBeUndefined()
    })

    test("keeps existing session_ids array untouched", async () => {
      //#given - modern mission.json shape
      const planPath = writePlan("modern-plan.md", "# Modern\n- [ ] 1. Work")
      const state: MissionState = {
        active_plan: planPath,
        started_at: "2026-01-01T00:00:00Z",
        session_ids: ["ses-a", "ses-b"],
        plan_name: "modern-plan",
      }
      writeMissionState(testDir, state)

      //#when
      const result = readMissionState(testDir)

      //#then
      expect(result?.session_ids).toEqual(["ses-a", "ses-b"])
    })
  })

  describe("rotateMissionIfComplete", () => {
    test("clears mission.json when the active plan is complete", async () => {
      //#given - mission pointing at a now-complete plan
      const planPath = writePlan("done-plan.md", "# Done\n- [x] 1. Finished")
      const state: MissionState = {
        active_plan: planPath,
        started_at: "2026-01-01T00:00:00Z",
        session_ids: ["ses-1"],
        plan_name: "done-plan",
      }
      writeMissionState(testDir, state)

      //#when
      const result = rotateMissionIfComplete(testDir)

      //#then - no zombie resume: file gone, rotated flag set
      expect(result.rotated).toBe(true)
      expect(result.state).toBeNull()
      expect(readMissionState(testDir)).toBeNull()
      expect(existsSync(join(matrixDir, "mission.json"))).toBe(false)
    })

    test("keeps mission.json when the active plan is incomplete", async () => {
      //#given - mission pointing at an incomplete plan
      const planPath = writePlan("open-plan.md", "# Open\n- [ ] 1. Work")
      const state: MissionState = {
        active_plan: planPath,
        started_at: "2026-01-01T00:00:00Z",
        session_ids: ["ses-1"],
        plan_name: "open-plan",
      }
      writeMissionState(testDir, state)

      //#when
      const result = rotateMissionIfComplete(testDir)

      //#then - mission preserved for resume
      expect(result.rotated).toBe(false)
      expect(result.state?.active_plan).toBe(planPath)
      expect(readMissionState(testDir)).not.toBeNull()
    })

    test("returns not-rotated when no mission.json exists", async () => {
      //#given - no mission file
      //#when
      const result = rotateMissionIfComplete(testDir)

      //#then
      expect(result.rotated).toBe(false)
      expect(result.state).toBeNull()
    })

    test("rotates legacy single-session_id mission pointing at a complete plan", async () => {
      //#given - legacy shape + complete plan
      const planPath = writePlan("legacy-done.md", "# Legacy Done\n- [x] 1. Finished")
      writeLegacyMission(planPath, "ses-legacy-9")

      //#when
      const result = rotateMissionIfComplete(testDir)

      //#then - normalized on read, then rotated away
      expect(result.rotated).toBe(true)
      expect(readMissionState(testDir)).toBeNull()
    })
  })
})
