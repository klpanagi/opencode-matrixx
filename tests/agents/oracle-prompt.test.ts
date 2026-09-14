import { describe, expect, test } from "bun:test"
import { ORACLE_PLAN_GENERATION, ORACLE_SYSTEM_PROMPT } from "../../src/agents/oracle"

describe("ORACLE_SYSTEM_PROMPT Smith invocation policy", () => {
  test("should direct providing ONLY the file path string when invoking Smith", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when / #then
    expect(prompt.toLowerCase()).toMatch(/smith.*only.*path|path.*only.*smith/)
  })

  test("should forbid wrapping Smith invocation in explanations or markdown", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when / #then
    expect(prompt.toLowerCase()).toMatch(/not.*wrap|no.*explanation|no.*markdown/)
  })
})

describe("ORACLE_SYSTEM_PROMPT zero human intervention", () => {
  test("should enforce universal zero human intervention rule", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("zero human intervention")
    expect(lowerPrompt).toContain("forbidden")
    expect(lowerPrompt).toMatch(/user manually tests|사용자가 직접 테스트/)
  })

  test("should require agent-executed QA scenarios as mandatory for all tasks", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("agent-executed qa scenarios")
    expect(lowerPrompt).toMatch(/mandatory.*all tasks|all tasks.*mandatory/)
  })

  test("should not contain ambiguous 'manual QA' terminology", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).not.toMatch(/manual QA procedures/i)
    expect(prompt).not.toMatch(/manual verification procedures/i)
    expect(prompt).not.toMatch(/Manual-only/i)
  })

  test("should require per-scenario format with detailed structure", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("preconditions")
    expect(lowerPrompt).toContain("failure indicators")
    expect(lowerPrompt).toContain("evidence")
    expect(prompt).toMatch(/negative/i)
  })

  test("should require QA scenario adequacy in self-review checklist", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toMatch(/every task has agent-executed qa scenarios/)
    expect(lowerPrompt).toMatch(/happy-path and negative/)
    expect(lowerPrompt).toMatch(/zero acceptance criteria require human/)
  })
})

describe("ORACLE_SYSTEM_PROMPT delegation policy", () => {
  test("should document background mode as the default for delegations", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("default to background mode")
    expect(prompt).toContain("run_in_background=true")
  })

  test("should forbid nesting a blocking subagent call inside a blocking session", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("never nest a blocking subagent call")
    expect(lowerPrompt).toContain("fixed poll budget")
  })

  test("should direct sequential top-level calls with background_output collection", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when
    const lowerPrompt = prompt.toLowerCase()

    //#then
    expect(lowerPrompt).toContain("sequential top-level calls")
    expect(prompt).toContain("background_output(task_id=")
  })

  test("should contain no blocking run_in_background=false invocation", () => {
    //#given
    const prompt = ORACLE_SYSTEM_PROMPT

    //#when / #then
    // Matches an actual argument assignment (followed by comma, newline, or close paren),
    // so policy prose that merely names the forbidden value does not count as an invocation.
    expect(prompt).not.toMatch(/run_in_background=false\s*[,\n)]/)
  })

  test("should summon Seraph in background mode, not blocking", () => {
    //#given
    const planGeneration = ORACLE_PLAN_GENERATION

    //#when / #then
    expect(planGeneration).toContain('subagent_type="seraph"')
    expect(planGeneration).toMatch(/subagent_type="seraph"[\s\S]*?run_in_background=true/)
    expect(planGeneration).toContain("background_output(task_id=seraphTask.task_id)")
  })
})
