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

  test("should document that one call cannot return a plan above the soft cap", () => {
    // given - the start-work template

    // when - we check for soft-cap guidance

    // then - it should explain why pagination is needed
    expect(START_WORK_TEMPLATE).toContain("one call cannot return a plan that renders above the soft cap")
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
