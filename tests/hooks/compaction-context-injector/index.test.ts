import { afterAll, describe, expect, it, mock } from "bun:test"

mock.module("../../../src/shared/system-directive", () => ({
  createSystemDirective: (type: string) => `[DIRECTIVE:${type}]`,
  SystemDirectiveTypes: {
    TODO_CONTINUATION: "TODO CONTINUATION",
    MATRIX_LOOP_LOOP: "MATRIX_LOOP LOOP",
    MISSION_CONTINUATION: "MISSION CONTINUATION",
    DELEGATION_REQUIRED: "DELEGATION REQUIRED",
    SINGLE_TASK_ONLY: "SINGLE TASK ONLY",
    COMPACTION_CONTEXT: "COMPACTION CONTEXT",
    CONTEXT_WINDOW_MONITOR: "CONTEXT WINDOW MONITOR",
    ORACLE_READ_ONLY: "ORACLE READ-ONLY",
  },
}))

afterAll(() => {
  mock.restore()
})

import { TaskHistory } from "../../../src/features/background-agent/task-history"
import { createCompactionContextInjector } from "../../../src/hooks/compaction-context-injector/index"

describe("createCompactionContextInjector", () => {
  describe("Agent Verification State preservation", () => {
    it("includes Agent Verification State section in compaction prompt", async () => {
      //#given
      const injector = createCompactionContextInjector()

      //#when
      const prompt = injector()

      //#then
      expect(prompt).toContain("Agent Verification State")
      expect(prompt).toContain("Current Agent")
      expect(prompt).toContain("Verification Progress")
    })

    it("includes reviewer-agent continuity fields", async () => {
      //#given
      const injector = createCompactionContextInjector()

      //#when
      const prompt = injector()

      //#then
      expect(prompt).toContain("Previous Rejections")
      expect(prompt).toContain("Acceptance Status")
      expect(prompt).toContain("reviewer agents")
    })

    it("preserves file verification progress fields", async () => {
      //#given
      const injector = createCompactionContextInjector()

      //#when
      const prompt = injector()

      //#then
      expect(prompt).toContain("Pending Verifications")
      expect(prompt).toContain("Files already verified")
    })
  })

  it("restricts constraints to explicit verbatim statements", async () => {
    //#given
    const injector = createCompactionContextInjector()

    //#when
    const prompt = injector()

    //#then
    expect(prompt).toContain("Explicit Constraints (Verbatim Only)")
    expect(prompt).toContain("Do NOT invent")
    expect(prompt).toContain("Quote constraints verbatim")
  })

  describe("Delegated Agent Sessions", () => {
    it("keeps static prompt to 4 sections with delegated sessions via dynamic history only", async () => {
      //#given
      const injector = createCompactionContextInjector()

      //#when
      const prompt = injector()

      //#then
      // Static §8 boilerplate removed by Step-5 trim; delegated sessions
      // arrive via dynamic `### Active/Recent Delegated Sessions` history append.
      const sections = prompt.match(/^## \d\./gm) ?? []
      expect(sections).toHaveLength(4)
      expect(prompt).not.toContain("Delegated Agent Sessions")
      expect(prompt).not.toContain("RESUME, DON'T RESTART")
      expect(prompt).toContain("Agent Verification State")
    })

    it("injects actual task history when backgroundManager and sessionID provided", async () => {
      //#given
      const mockManager = { taskHistory: new TaskHistory() }
      mockManager.taskHistory.record("ses_parent", { id: "t1", sessionID: "ses_child", agent: "explore", description: "Find patterns", status: "completed", category: "quick" })
      const injector = createCompactionContextInjector(mockManager)

      //#when
      const prompt = injector("ses_parent")

      //#then
      expect(prompt).toContain("Active/Recent Delegated Sessions")
      expect(prompt).toContain("**explore**")
      expect(prompt).toContain("[quick]")
      expect(prompt).toContain("`ses_child`")
    })

    it("does not inject task history section when no entries exist", async () => {
      //#given
      const mockManager = { taskHistory: new TaskHistory() }
      const injector = createCompactionContextInjector(mockManager)

      // when
      const prompt = injector("ses_empty")

      //#then
      expect(prompt).not.toContain("Active/Recent Delegated Sessions")
    })
  })
})
