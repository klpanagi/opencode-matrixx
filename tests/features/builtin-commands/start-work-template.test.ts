import { describe, expect, test } from "bun:test"
import { START_WORK_TEMPLATE } from "../../../src/features/builtin-commands/templates/start-work"

describe("start-work template", () => {
  test("should export a non-empty template string", () => {
    // given - the start-work template

    // when - we access the template

    // then - it should be a non-empty string
    expect(typeof START_WORK_TEMPLATE).toBe("string")
    expect(START_WORK_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should reference plan_tasks for the manifest", () => {
    // given - the start-work template

    // when - we check for plan_tasks references

    // then - it should mention plan_tasks as the way to get the task manifest
    expect(START_WORK_TEMPLATE).toContain("plan_tasks")
  })

  test("should reference paginated plan_read with offset/limit", () => {
    // given - the start-work template

    // when - we check for pagination guidance

    // then - it should mention paginated plan_read with offset/limit
    expect(START_WORK_TEMPLATE).toContain("paginated plan_read")
    expect(START_WORK_TEMPLATE).toContain("offset/limit")
  })

  test("should NOT contain the impossible 'FULL plan file' wording", () => {
    // given - the start-work template

    // when - we check for the old impossible instruction

    // then - it should not contain the phrase "FULL plan file"
    expect(START_WORK_TEMPLATE).not.toContain("FULL plan file")
    expect(START_WORK_TEMPLATE).not.toContain("Read the full plan file")
  })

  test("should NOT document the removed 'one call cannot return' claim", () => {
    // given - the start-work template

    // when - we check for soft-cap guidance

    // then - the false contract is gone
    expect(START_WORK_TEMPLATE).not.toContain("one call cannot return a plan")
  })

  test("should teach section-selector-first reading, keeping pagination as fallback", () => {
    //#given the cut-over start-work template
    //#when we read the plan-reading guidance
    //#then it names the section selector, its precedence, and the pagination fallback
    expect(START_WORK_TEMPLATE).toContain("section selector FIRST")
    expect(START_WORK_TEMPLATE).toContain("`section` WINS over `offset`/`limit`")
    expect(START_WORK_TEMPLATE).toContain("sectionIndex")
    expect(START_WORK_TEMPLATE).toContain("paginated plan_read (offset/limit)")
  })

  test("should describe the cap as a ceiling that span reads bypass", () => {
    //#given the cut-over start-work template
    //#when we check the cap wording
    //#then the cap is not raised or removed, only bypassed by windowed/section reads
    expect(START_WORK_TEMPLATE).not.toMatch(/102[,_]?400/)
    expect(START_WORK_TEMPLATE).toContain("file_too_large")
    expect(START_WORK_TEMPLATE).toContain("ceiling, not a wall")
    expect(START_WORK_TEMPLATE).toContain("reads past it, at any file size")
  })

  test("should state plan_tasks degrades rather than refuses on an over-cap plan", () => {
    //#given the cut-over start-work template
    //#when we read the manifest guidance
    //#then it describes degradation, not a hard failure
    expect(START_WORK_TEMPLATE).toContain("`degraded`")
    expect(START_WORK_TEMPLATE).toContain("instead of failing")
  })

  test("should tell the agent what to do with a clamped read and with read_failed", () => {
    //#given the cut-over start-work template
    //#when we read the degraded-read guidance
    //#then clamped windows are re-read by their named window, and read_failed is not pagination-recoverable
    expect(START_WORK_TEMPLATE).toContain("`clamped`")
    expect(START_WORK_TEMPLATE).toContain("effective window")
    expect(START_WORK_TEMPLATE).toContain("pagination cannot recover from it")
  })

  test("should keep plan review explicit, never automatic", () => {
    //#given the cut-over start-work template
    //#when we read the critical reminders
    //#then plan review is wired to an explicit command only
    expect(START_WORK_TEMPLATE).toContain("/plan-review")
    expect(START_WORK_TEMPLATE).toContain("Never auto-trigger a plan review")
  })

  test("should reference plan_list with progress field", () => {
    // given - the start-work template

    // when - we check for plan_list references

    // then - it should mention plan_list and its progress field
    expect(START_WORK_TEMPLATE).toContain("plan_list")
    expect(START_WORK_TEMPLATE).toContain("progress field")
  })

  test("docs/orchestration.md should name plan_tasks", async () => {
    // given - the orchestration docs

    // when - we read the file
    const content = await Bun.file("docs/orchestration.md").text()

    // then - it should reference plan_tasks
    expect(content).toContain("plan_tasks")
  })

  test("docs/configurations.md should name plan_tasks", async () => {
    // given - the configurations docs

    // when - we read the file
    const content = await Bun.file("docs/configurations.md").text()

    // then - it should reference plan_tasks
    expect(content).toContain("plan_tasks")
  })

  test("docs/task-system.md should name plan_tasks", async () => {
    // given - the task-system docs

    // when - we read the file
    const content = await Bun.file("docs/task-system.md").text()

    // then - it should reference plan_tasks
    expect(content).toContain("plan_tasks")
  })

  test("docs/orchestration.md should document the soft render cap", async () => {
    // given - the orchestration docs

    // when - we read the file
    const content = await Bun.file("docs/orchestration.md").text()

    // then - it should document the plan read soft cap
    expect(content).toContain("40,000 rendered bytes")
  })
})
