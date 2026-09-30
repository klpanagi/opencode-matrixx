/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BuiltinAgentNameSchema } from "../../src/config/schema/agent-names"
import { AGENT_DISPLAY_NAMES } from "../../src/shared/agent-display-names"
import { getAgentToolRestrictions } from "../../src/shared/agent-tool-restrictions"
import { agentPattern } from "../../src/hooks/runtime-fallback/agent-resolver"
import { createAuditorAgent, AUDITOR_SYSTEM_PROMPT } from "../../src/agents/auditor"

const REPO_ROOT = join(import.meta.dir, "..", "..")
const AGENT_NAME = "auditor"

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8")
}

/**
 * Every registration touchpoint the post-execution reviewer must appear in.
 *
 * A missed surface does NOT throw — it produces an agent that exists, typechecks,
 * and silently never dispatches. So this list is exhaustive, not representative.
 */
const REGISTRATION_TOUCHPOINTS: ReadonlyArray<{ file: string; label: string }> = [
  { file: "src/agents/auditor.ts", label: "agent module (factory + prompt + metadata)" },
  { file: "src/agents/index.ts", label: "barrel export of factory + prompt + metadata" },
  { file: "src/agents/builtin-agents.ts", label: "agentSources + agentMetadata (2 edits)" },
  { file: "src/agents/types.ts", label: "BuiltinAgentName union" },
  { file: "src/config/schema/agent-names.ts", label: "BuiltinAgentNameSchema" },
  { file: "src/config/schema/agent-overrides.ts", label: "AgentOverridesSchema map" },
  { file: "src/shared/agent-display-names.ts", label: "AGENT_DISPLAY_NAMES" },
  { file: "src/shared/agent-tool-restrictions.ts", label: "AGENT_RESTRICTIONS map" },
  { file: "src/shared/model-requirements.ts", label: "fallbackChain" },
  { file: "src/hooks/runtime-fallback/agent-resolver.ts", label: "AGENT_NAMES (drives derived regex)" },
  { file: "src/plugin-handlers/agent-config-handler.ts", label: "exploreAgents set" },
  { file: "src/agents/AGENTS.md", label: "documentation surface" },
]

describe("auditor registration — all 12 surfaces", () => {
  for (const { file, label } of REGISTRATION_TOUCHPOINTS) {
    test(`registers the name in ${file} (${label})`, () => {
      //#given
      const source = readRepoFile(file)

      //#when
      const mentionsAgent = source.includes(AGENT_NAME)

      //#then
      expect(mentionsAgent).toBe(true)
    })
  }

  test("builtin-agents.ts registers the name twice (agentSources AND agentMetadata)", () => {
    //#given
    const source = readRepoFile("src/agents/builtin-agents.ts")
    const occurrences = source.split(AGENT_NAME).length - 1

    //#when
    // both maps are required edits; one without the other half-registers the agent
    const sourcesEntry = /\n\s{2}auditor:\s*createAuditorAgent,/.test(source)
    const metadataEntry = /\n\s{2}auditor:\s*AUDITOR_PROMPT_METADATA,/.test(source)

    //#then
    expect(sourcesEntry).toBe(true)
    expect(metadataEntry).toBe(true)
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})

describe("auditor registration — runtime surfaces are real, not text matches", () => {
  test("BuiltinAgentNameSchema accepts the name", () => {
    //#given
    const parsed = BuiltinAgentNameSchema.safeParse(AGENT_NAME)

    //#when / #then
    expect(parsed.success).toBe(true)
  })

  test("AGENT_DISPLAY_NAMES carries a non-empty display name", () => {
    //#given
    const displayName = AGENT_DISPLAY_NAMES[AGENT_NAME]

    //#when / #then
    expect(typeof displayName).toBe("string")
    expect(displayName).not.toBe("")
  })

  test("AGENT_RESTRICTIONS denies write and edit (post-execution reviewer writes only its report)", () => {
    //#given
    const restrictions = getAgentToolRestrictions(AGENT_NAME)

    //#when / #then
    expect(restrictions.write).toBe(false)
    expect(restrictions.edit).toBe(false)
  })

  test("the derived agentPattern regex actually matches the name in prose", () => {
    //#given
    const runtimeFallbackMessage = "Falling back for agent auditor (1 of 2)"

    //#when
    const matched = agentPattern.test(runtimeFallbackMessage)

    //#then
    expect(matched).toBe(true)
  })

  test("exploreAgents set carries the name (context-discipline explore branch)", () => {
    //#given
    const source = readRepoFile("src/plugin-handlers/agent-config-handler.ts")

    //#when
    const exploreSet = source.match(/const exploreAgents = new Set\(\[([^\]]*)\]\)/)?.[1] ?? ""

    //#then
    expect(exploreSet).toContain(`"${AGENT_NAME}"`)
  })
})

describe("auditor factory shape", () => {
  test("exposes the .mode static required by the AgentFactory form", () => {
    //#given
    const factory = createAuditorAgent

    //#when / #then
    expect(factory.mode).toBe("subagent")
  })

  test("builds an AgentConfig carrying the auditor prompt", () => {
    //#given
    const model = "anthropic/claude-sonnet-4-6"

    //#when
    const config = createAuditorAgent(model)

    //#then
    expect(config.mode).toBe("subagent")
    expect(config.model).toBe(model)
    expect(config.prompt).toBe(AUDITOR_SYSTEM_PROMPT)
  })
})

describe("auditor prompt — post-execution framing and report contract", () => {
  test("states the four required report parts", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toContain("**Summary**")
    expect(prompt).toContain("**Score**")
    expect(prompt).toContain("**Complexity**")
    expect(prompt).toContain("**Required Effort**")
  })

  test("frames the review as POST-execution, not pre-execution", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toMatch(/after execution|post-execution/i)
  })

  test("locks the trigger to the explicit /plan-review command only", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toContain("/plan-review")
    expect(prompt).toMatch(/never.*automatic|only.*\/plan-review/i)
  })

  test("treats a zero-checkbox plan as not_scorable, never 1.0", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toContain("not_scorable")
    expect(prompt).toMatch(/zero.checkbox|zero checkbox/i)
  })

  test("forbids writing the report into the plan file", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toContain(".matrixx/reviews/")
    expect(prompt).toMatch(/never.*plan file|do not write.*plan file/i)
  })

  test("forbids trusting the checkbox heuristic for completeness", () => {
    //#given
    const prompt = AUDITOR_SYSTEM_PROMPT

    //#when / #then
    expect(prompt).toMatch(/checkbox/i)
    expect(prompt).toMatch(/do not trust|never trust|not evidence/i)
  })
})
