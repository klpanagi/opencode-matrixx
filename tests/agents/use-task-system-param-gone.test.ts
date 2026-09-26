/// <reference types="bun-types" />

/**
 * Guardrail: the `useTaskSystem` parameter must be GONE from `src/agents/**`
 * (correction C7) — not merely defaulted to `true`.
 *
 * Today it appears in 3 shapes at 10+ anchors:
 *   - 6 `= false` defaults  (builtin-agents.ts, mouse/agent.ts, keymaker, morpheus)
 *   - 2 pass-throughs        (builtin-agents.ts)
 *   - 2 optional-param sites (architect-agent.ts, general-agents.ts)
 * plus 3 interpolated `| Tracking | ${useTaskSystem ? ... } |` prompt rows.
 *
 * STRUCTURE — this file currently holds the STATIC half only. Task 7 appends
 * the behavioral (rendered-prompt) assertions to the same `describe` blocks
 * below: import the agent factories, render the prompts, and assert no prompt
 * contains a todo-system branch. Do not delete the static scans; they are the
 * cheap half of the same gate.
 *
 * This file is RED by design until Task 7.
 */

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

const AGENTS_SRC = path.join(import.meta.dir, "../../src/agents")

interface SourceFile {
  relPath: string
  content: string
}

function agentSources(): SourceFile[] {
  return fs
    .readdirSync(AGENTS_SRC, { recursive: true, encoding: "utf-8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => ({
      relPath: entry,
      content: fs.readFileSync(path.join(AGENTS_SRC, entry), "utf-8"),
    }))
}

describe("useTaskSystem is gone from src/agents (C7 static half)", () => {
  test("the identifier appears in no agent source file", () => {
    //#given every non-test file under src/agents
    const offenders = agentSources()
      .filter(({ content }) => /useTaskSystem/.test(content))
      .map(({ relPath }) => relPath)

    //#then the pivot parameter no longer exists in the agent layer
    expect(offenders).toEqual([])
  })

  test("no `useTaskSystem = false` default survives", () => {
    //#given every non-test file under src/agents
    const offenders = agentSources()
      .filter(({ content }) => /useTaskSystem\s*(?::[^=]+)?=\s*false/.test(content))
      .map(({ relPath }) => relPath)

    //#then there is no "default off" branch left to flip
    expect(offenders).toEqual([])
  })

  test("no trailing boolean parameter typed as the pivot survives", () => {
    //#given every non-test file under src/agents
    const offenders = agentSources()
      .filter(({ content }) => /useTaskSystem\??\s*:\s*boolean/.test(content))
      .map(({ relPath }) => relPath)

    //#then no factory or builder still accepts the flag
    expect(offenders).toEqual([])
  })
})

describe("task-tool instruction rows name TaskUpdate literally (DoD-5 canary)", () => {
  test("no interpolated `| Tracking | ${...} |` row survives", () => {
    //#given every non-test file under src/agents
    const offenders = agentSources()
      .filter(({ content }) => /^\|\s*Tracking\s*\|\s*\$\{/m.test(content))
      .map(({ relPath }) => relPath)

    //#then the prompt tables carry a literal tool name
    expect(offenders).toEqual([])
  })

  test("at least three literal `| Tracking | TaskUpdate |` rows exist", () => {
    //#given every non-test file under src/agents (positive side, so an empty
    // corpus cannot pass vacuously)
    const files = agentSources().filter(({ content }) =>
      /^\|\s*Tracking\s*\|\s*TaskUpdate\s*\|/m.test(content),
    )

    //#then the 3 tracking rows still exist with a hard-coded tool name
    expect(files.length).toBeGreaterThanOrEqual(3)
  })
})

/**
 * BEHAVIORAL half (R8). The static scans above read tool config, not the rendered
 * prompt — only a string assertion can catch a prompt that still names a banned
 * tool. The plan named four "DIRECT EXPORT" anchors, but two of them
 * (`morpheus.ts:148` buildDynamicMorpheusPrompt, `keymaker.ts:117`
 * buildKeymakerPrompt) are module-private. The behavioral equivalent is to render
 * through the PUBLIC factory that embeds each section, which is strictly stronger:
 * it also covers every section the private builder interpolates. The Mouse row is
 * additionally swept across all five model-specific prompt variants, since
 * `buildMousePrompt` is itself exported and the three ternary slop sites lived
 * in three of those variants.
 */
describe("rendered prompts name only the task tools (R8)", () => {
  const TASK_TOOLS = ["TaskCreate", "TaskUpdate"]
  const BANNED = /todowrite|todoread|TodoWrite/i
  const TRACKING_ROW = /^\|\s*Tracking\s*\|\s*([^|]+?)\s*\|/gm

  function assertTaskSystemOnly(label: string, prompt: string): void {
    //#given a prompt rendered with non-legacy arguments only
    expect(prompt.length).toBeGreaterThan(0)

    //#then both task tools are advertised
    for (const tool of TASK_TOOLS) {
      expect(`${label}: missing ${tool}\n${prompt}`).toContain(tool)
    }

    //#then no legacy todo tool is named in any casing
    expect(`${label}: banned tool\n${prompt}`).not.toMatch(BANNED)

    //#then no `| Tracking |` row names a non-task tool
    for (const match of prompt.matchAll(TRACKING_ROW)) {
      expect(`${label}: tracking cell "${match[1]}"`).toMatch(/TaskCreate|TaskUpdate/)
    }
  }

  function promptOf(config: { prompt?: unknown }): string {
    expect(typeof config.prompt).toBe("string")
    return config.prompt as string
  }

  test("morpheus prompt advertises only task tools", async () => {
    //#given the morpheus factory invoked with non-legacy arguments only
    const { createMorpheusAgent } = await import("../../src/agents/morpheus")

    //#when the prompt is rendered
    const prompt = promptOf(
      createMorpheusAgent("anthropic/claude-sonnet-4-5", undefined, ["task_create", "task_update"], [], []),
    )

    //#then it is task-system-only
    assertTaskSystemOnly("morpheus", prompt)
  })

  test("keymaker prompt advertises only task tools", async () => {
    //#given the keymaker factory invoked with non-legacy arguments only
    const { createKeymakerAgent } = await import("../../src/agents/keymaker")

    //#when the prompt is rendered
    const prompt = promptOf(createKeymakerAgent("gpt-5.3-codex"))

    //#then it is task-system-only
    assertTaskSystemOnly("keymaker", prompt)
  })

  test("mouse prompt advertises only task tools for every model variant", async () => {
    //#given the mouse factory invoked with non-legacy arguments only, once per variant
    const { createMouseAgentWithOverrides } = await import("../../src/agents/mouse/agent")
    const models = [
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-5.3",
      "opencode-go/deepseek-v4",
      "opencode-go/mimo-2",
      "opencode-go/qwen3-coder",
    ]

    //#when each prompt is rendered
    const rendered = models.map((model) => ({
      model,
      prompt: promptOf(createMouseAgentWithOverrides({ model })),
    }))

    //#then every variant is task-system-only
    for (const { model, prompt } of rendered) {
      assertTaskSystemOnly(`mouse[${model}]`, prompt)
    }
  })
})
