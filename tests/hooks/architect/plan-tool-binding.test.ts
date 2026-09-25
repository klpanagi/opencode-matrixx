/// <reference types="bun-types" />
import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"
import { ARCHITECT_SYSTEM_PROMPT } from "../../../src/agents/architect/default"
import { ARCHITECT_GPT_SYSTEM_PROMPT } from "../../../src/agents/architect/gpt"
import { buildOrchestratorReminder } from "../../../src/hooks/architect/verification-reminders"
import { MISSION_CONTINUATION_PROMPT } from "../../../src/hooks/architect/system-reminder-templates"
import {
  createPlanReadTool,
  createPlanTasksTool,
} from "../../../src/tools/plan"

// ── Prohibited patterns (call form + prose form) ─────────────────────
const PROHIBITED_CALL_FORM = /Read\(["']\.matrixx\/plans/
const PROHIBITED_PROSE_READ_PLAN_FILE_AT = /Read the plan file at/
const PROHIBITED_PROSE_READ_THE_PLAN_FILE = /READ the plan file/
const PROHIBITED_PROSE_READ_PLAN_FILE = /Read plan file/
const PROHIBITED_EDIT_ON_PLAN = /using the `Edit` tool.*\bplan\b|Edit.*\bplan\b.*checkbox/i

// ── Required presence patterns ───────────────────────────────────────
const REQUIRED_PLAN_TASKS = /plan_tasks/
const REQUIRED_PLAN_READ = /plan_read/
const REQUIRED_NON_DELEGATION = /MUST NEVER be delegated/

// ── Build the reminder string for testing ────────────────────────────
const REMINDER = buildOrchestratorReminder(
  "test-plan",
  { total: 10, completed: 5 },
  "ses_test123",
)

/**
 * Assert that NO prohibited plan-Read / Edit-tool-on-plan instructions
 * exist in the given string.
 */
function assertNoProhibitedPlanInstructions(
  label: string,
  content: string,
): void {
  // Call form: Read(".matrixx/plans/...")
  expect(content).not.toMatch(PROHIBITED_CALL_FORM)
  // Prose forms
  expect(content).not.toMatch(PROHIBITED_PROSE_READ_PLAN_FILE_AT)
  expect(content).not.toMatch(PROHIBITED_PROSE_READ_THE_PLAN_FILE)
  expect(content).not.toMatch(PROHIBITED_PROSE_READ_PLAN_FILE)
  // Edit-tool-on-plan
  expect(content).not.toMatch(PROHIBITED_EDIT_ON_PLAN)
}

/**
 * Assert that plan_tasks, plan_read, and non-delegation rule are present.
 */
function assertRequiredPresence(label: string, content: string): void {
  expect(content).toMatch(REQUIRED_PLAN_TASKS)
  expect(content).toMatch(REQUIRED_PLAN_READ)
  expect(content).toMatch(REQUIRED_NON_DELEGATION)
}

// ═══════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════

describe("plan-tool binding — absence of prohibited plan-Read instructions", () => {
  test("ARCHITECT_SYSTEM_PROMPT has no generic plan-Read (call or prose)", () => {
    //#given
    const prompt = ARCHITECT_SYSTEM_PROMPT

    //#when / #then
    assertNoProhibitedPlanInstructions("ARCHITECT_SYSTEM_PROMPT", prompt)
  })

  test("ARCHITECT_GPT_SYSTEM_PROMPT has no generic plan-Read (call or prose)", () => {
    //#given
    const prompt = ARCHITECT_GPT_SYSTEM_PROMPT

    //#when / #then
    assertNoProhibitedPlanInstructions("ARCHITECT_GPT_SYSTEM_PROMPT", prompt)
  })

  test("buildOrchestratorReminder has no generic plan-Read (call or prose)", () => {
    //#given
    const reminder = REMINDER

    //#when / #then
    assertNoProhibitedPlanInstructions("buildOrchestratorReminder", reminder)
  })

  test("MISSION_CONTINUATION_PROMPT has no generic plan-Read prose", () => {
    //#given
    const prompt = MISSION_CONTINUATION_PROMPT

    //#when / #then
    // The mission continuation prompt previously had "Read the plan file NOW"
    expect(prompt).not.toMatch(/Read the plan file/)
    expect(prompt).not.toMatch(/Read plan file/)
  })
})

describe("plan-tool binding — required plan_tasks / plan_read presence", () => {
  test("ARCHITECT_SYSTEM_PROMPT contains plan_tasks, plan_read, and non-delegation rule", () => {
    //#given
    const prompt = ARCHITECT_SYSTEM_PROMPT

    //#when / #then
    assertRequiredPresence("ARCHITECT_SYSTEM_PROMPT", prompt)
  })

  test("ARCHITECT_GPT_SYSTEM_PROMPT contains plan_tasks, plan_read, and non-delegation rule", () => {
    //#given
    const prompt = ARCHITECT_GPT_SYSTEM_PROMPT

    //#when / #then
    assertRequiredPresence("ARCHITECT_GPT_SYSTEM_PROMPT", prompt)
  })

  test("buildOrchestratorReminder contains plan_tasks, plan_read, and plan_update", () => {
    //#given
    const reminder = REMINDER

    //#when / #then
    expect(reminder).toMatch(REQUIRED_PLAN_TASKS)
    expect(reminder).toMatch(REQUIRED_PLAN_READ)
    expect(reminder).toMatch(/plan_update/)
  })
})

describe("plan-tool binding — tool registry presence", () => {
  test("plan_read factory is exported from tools/plan barrel", () => {
    //#given / #when / #then
    expect(typeof createPlanReadTool).toBe("function")
  })

  test("plan_tasks factory is exported from tools/plan barrel", () => {
    //#given / #when / #then
    expect(typeof createPlanTasksTool).toBe("function")
  })

  test("planToolsRecord in tool-registry includes plan_read and plan_tasks", () => {
    //#given — read the tool-registry source and verify the record construction
    const registrySource = readFileSync(
      "src/plugin/tool-registry.ts",
      "utf8",
    )

    // The planToolsRecord must include plan_read and plan_tasks keys
    expect(registrySource).toContain("plan_read:")
    expect(registrySource).toContain("plan_tasks:")

    // And planToolsRecord must be spread into allTools
    expect(registrySource).toContain("...planToolsRecord")
  })
})
