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
