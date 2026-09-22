import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MissionState } from "../../../src/features/mission-state"
import {
  clearMissionState,
  writeMissionState,
} from "../../../src/features/mission-state"
import * as sessionState from "../../../src/features/session-state"
import { createStartWorkHook } from "../../../src/hooks/start-work/index"

describe("start-work hook", () => {
  let testDir: string
  let matrixDir: string

  function createMockPluginInput() {
    return {
      directory: testDir,
      client: {},
    } as Parameters<typeof createStartWorkHook>[0]
  }

  beforeEach(() => {
    testDir = join(tmpdir(), `start-work-test-${randomUUID()}`)
    matrixDir = join(testDir, ".matrixx")
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    if (!existsSync(matrixDir)) {
      mkdirSync(matrixDir, { recursive: true })
    }
    clearMissionState(testDir)
  })

  afterEach(() => {
    clearMissionState(testDir)
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe("chat.message handler", () => {
    test("should ignore non-start-work commands", async () => {
      // given - hook and non-start-work message
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "Just a regular message" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - output should be unchanged
      expect(output.parts[0].text).toBe("Just a regular message")
    })

    test("should detect start-work command via session-context tag", async () => {
      // given - hook and start-work message
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Some context here</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - output should be modified with context info
      expect(output.parts[0].text).toContain("---")
    })

    test("should inject resume info when existing mission state found", async () => {
      // given - existing mission state with incomplete plan
      const planPath = join(testDir, "test-plan.md")
      writeFileSync(planPath, "# Plan\n- [ ] Task 1\n- [x] Task 2")

      const state: MissionState = {
        active_plan: planPath,
        started_at: "2026-01-02T10:00:00Z",
        session_ids: ["session-1"],
        plan_name: "test-plan",
      }
      writeMissionState(testDir, state)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should show resuming status
      expect(output.parts[0].text).toContain("RESUMING")
      expect(output.parts[0].text).toContain("test-plan")
    })

    test("should replace $SESSION_ID placeholder", async () => {
      // given - hook and message with placeholder
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Session: $SESSION_ID</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "ses-abc123" },
        output
      )

      // then - placeholder should be replaced
      expect(output.parts[0].text).toContain("ses-abc123")
      expect(output.parts[0].text).not.toContain("$SESSION_ID")
    })

    test("should replace $TIMESTAMP placeholder", async () => {
      // given - hook and message with placeholder
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: "<session-context>Time: $TIMESTAMP</session-context>",
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - placeholder should be replaced with ISO timestamp
      expect(output.parts[0].text).not.toContain("$TIMESTAMP")
      expect(output.parts[0].text).toMatch(/\d{4}-\d{2}-\d{2}T/)
    })

    test("should auto-select when only one incomplete plan among multiple plans", async () => {
      // given - multiple plans but only one incomplete
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      // Plan 1: complete (all checked)
      const plan1Path = join(plansDir, "plan-complete.md")
      writeFileSync(plan1Path, "# Plan Complete\n- [x] Task 1\n- [x] Task 2")

      // Plan 2: incomplete (has unchecked)
      const plan2Path = join(plansDir, "plan-incomplete.md")
      writeFileSync(plan2Path, "# Plan Incomplete\n- [ ] Task 1\n- [x] Task 2")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should auto-select the incomplete plan, not ask user
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
      expect(output.parts[0].text).toContain("plan-incomplete")
      expect(output.parts[0].text).not.toContain("Multiple Plans Found")
    })

    test("should wrap multiple plans message in system-reminder tag", async () => {
      // given - multiple incomplete plans
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      const plan1Path = join(plansDir, "plan-a.md")
      writeFileSync(plan1Path, "# Plan A\n- [ ] Task 1")

      const plan2Path = join(plansDir, "plan-b.md")
      writeFileSync(plan2Path, "# Plan B\n- [ ] Task 2")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should use system-reminder tag format
      expect(output.parts[0].text).toContain("<system-reminder>")
      expect(output.parts[0].text).toContain("</system-reminder>")
      expect(output.parts[0].text).toContain("Multiple Plans Found")
    })

    test("should use 'ask user' prompt style for multiple plans", async () => {
      // given - multiple incomplete plans
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      const plan1Path = join(plansDir, "plan-x.md")
      writeFileSync(plan1Path, "# Plan X\n- [ ] Task 1")

      const plan2Path = join(plansDir, "plan-y.md")
      writeFileSync(plan2Path, "# Plan Y\n- [ ] Task 2")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should prompt agent to ask user, not ask directly
      expect(output.parts[0].text).toContain("Ask the user")
      expect(output.parts[0].text).not.toContain("Which plan would you like to work on?")
    })

    test("should select explicitly specified plan name from user-request, ignoring existing mission state", async () => {
      // given - existing mission state pointing to old plan
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      // Old plan (in mission state)
      const oldPlanPath = join(plansDir, "old-plan.md")
      writeFileSync(oldPlanPath, "# Old Plan\n- [ ] Old Task 1")

      // New plan (user wants this one)
      const newPlanPath = join(plansDir, "new-plan.md")
      writeFileSync(newPlanPath, "# New Plan\n- [ ] New Task 1")

      // Set up stale mission state pointing to old plan
      const staleState: MissionState = {
        active_plan: oldPlanPath,
        started_at: "2026-01-01T10:00:00Z",
        session_ids: ["old-session"],
        plan_name: "old-plan",
      }
      writeMissionState(testDir, staleState)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>new-plan</user-request>
</session-context>`,
          },
        ],
      }

      // when - user explicitly specifies new-plan
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should select new-plan, NOT resume old-plan
      expect(output.parts[0].text).toContain("new-plan")
      expect(output.parts[0].text).not.toContain("RESUMING")
      expect(output.parts[0].text).not.toContain("old-plan")
    })

    test("should strip ultrawork/ulw keywords from plan name argument", async () => {
      // given - plan with ultrawork keyword in user-request
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      const planPath = join(plansDir, "my-feature-plan.md")
      writeFileSync(planPath, "# My Feature Plan\n- [ ] Task 1")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>my-feature-plan ultrawork</user-request>
</session-context>`,
          },
        ],
      }

      // when - user specifies plan with ultrawork keyword
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should find plan without ultrawork suffix
      expect(output.parts[0].text).toContain("my-feature-plan")
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
    })

    test("should strip ulw keyword from plan name argument", async () => {
      // given - plan with ulw keyword in user-request
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      const planPath = join(plansDir, "api-refactor.md")
      writeFileSync(planPath, "# API Refactor\n- [ ] Task 1")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>api-refactor ulw</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should find plan without ulw suffix
      expect(output.parts[0].text).toContain("api-refactor")
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
    })

    test("should match plan by partial name", async () => {
      // given - user specifies partial plan name
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })

      const planPath = join(plansDir, "2026-01-15-feature-implementation.md")
      writeFileSync(planPath, "# Feature Implementation\n- [ ] Task 1")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [
          {
            type: "text",
            text: `<session-context>
<user-request>feature-implementation</user-request>
</session-context>`,
          },
        ],
      }

      // when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      // then - should find plan by partial match
      expect(output.parts[0].text).toContain("2026-01-15-feature-implementation")
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
    })
  })

  describe("session agent management", () => {
    test("should update session agent to Architect when start-work command is triggered", async () => {
      // given
      const updateSpy = spyOn(sessionState, "updateSessionAgent")
      
      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      // when
      await hook["chat.message"](
        { sessionID: "ses-oracle-to-morpheus" },
        output
      )

      // then
      expect(updateSpy).toHaveBeenCalledWith("ses-oracle-to-morpheus", "architect")
      updateSpy.mockRestore()
    })
  })

  describe("staleness-aware filter (Task 5)", () => {
    test("auto-selects fresh incomplete when stale orphans exist", async () => {
      //#given - one fresh incomplete plus one stale orphan
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })
      const freshPath = join(plansDir, "fresh-work.md")
      writeFileSync(freshPath, "# Fresh\n- [ ] 1. Active work")
      const stalePath = join(plansDir, "stale-orphan.md")
      writeFileSync(stalePath, "# Stale\n- [ ] 1. Old work")
      const old = new Date(Date.now() - 72 * 60 * 60 * 1000)
      utimesSync(stalePath, old, old)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      //#when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      //#then - stale orphan does not block auto-select of the fresh plan
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
      expect(output.parts[0].text).toContain("fresh-work")
      expect(output.parts[0].text).not.toContain("Multiple Plans Found")
    })

    test("shows stale candidate section with tags in Multiple Plans Found", async () => {
      //#given - two fresh incomplete plus one stale orphan
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })
      writeFileSync(join(plansDir, "plan-a.md"), "# Plan A\n- [ ] 1. Task 1")
      writeFileSync(join(plansDir, "plan-b.md"), "# Plan B\n- [ ] 1. Task 2")
      const stalePath = join(plansDir, "stale-orphan.md")
      writeFileSync(stalePath, "# Stale\n- [ ] 1. Old work")
      const old = new Date(Date.now() - 72 * 60 * 60 * 1000)
      utimesSync(stalePath, old, old)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      //#when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      //#then - actionable listed with progress, stale demoted with tag
      expect(output.parts[0].text).toContain("Multiple Plans Found")
      expect(output.parts[0].text).toContain("0/1")
      expect(output.parts[0].text).toContain("[stale]")
      expect(output.parts[0].text).toContain("ago")
    })

    test("clears mission.json when the active plan is complete", async () => {
      //#given - mission pointing at a now-complete plan plus a fresh plan
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })
      const donePath = join(plansDir, "done-plan.md")
      writeFileSync(donePath, "# Done\n- [x] 1. Finished")
      const freshPath = join(plansDir, "fresh-next.md")
      writeFileSync(freshPath, "# Fresh Next\n- [ ] 1. New work")
      const state: MissionState = {
        active_plan: donePath,
        started_at: "2026-01-01T10:00:00Z",
        session_ids: ["old-session"],
        plan_name: "done-plan",
      }
      writeMissionState(testDir, state)

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      //#when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      //#then - no zombie resume: rotated to the fresh plan
      expect(output.parts[0].text).not.toContain("RESUMING")
      expect(output.parts[0].text).toContain("Previous Work Complete")
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
      expect(output.parts[0].text).toContain("fresh-next")
    })

    test("triage-empty plans are tagged and never auto-selected", async () => {
      //#given - one fresh incomplete plus one empty prose-only plan
      const plansDir = join(testDir, ".matrixx", "plans")
      mkdirSync(plansDir, { recursive: true })
      writeFileSync(join(plansDir, "fresh-work.md"), "# Fresh\n- [ ] 1. Active work")
      writeFileSync(join(plansDir, "empty-notes.md"), "# Notes\nJust prose, no checkboxes.")

      const hook = createStartWorkHook(createMockPluginInput())
      const output = {
        parts: [{ type: "text", text: "<session-context></session-context>" }],
      }

      //#when
      await hook["chat.message"](
        { sessionID: "session-123" },
        output
      )

      //#then - fresh plan auto-selected; empty plan excluded from actionable
      expect(output.parts[0].text).toContain("Auto-Selected Plan")
      expect(output.parts[0].text).toContain("fresh-work")
    })
  })
})
