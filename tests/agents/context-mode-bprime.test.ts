/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import {
  _resetDisciplineCacheForTesting,
  buildCompactContextDisciplineSection,
  buildContextDisciplineSection,
  buildExploreDisciplineSection,
} from "../../src/agents/dynamic-agent-prompt-builder"
import { createContextModeEnforcerHook } from "../../src/hooks/context-mode-enforcer/hook"
import type { MatrixxConfig } from "../../src/config"
import { injectContextDiscipline } from "../../src/plugin-handlers/agent-config-handler"
import {
  _setDisciplinePathForTesting,
  resolveGrepGlobUsable,
  setContextModeForPrompts,
} from "../../src/shared/context-mode-enforcement"

const FAKE_PATH = "/nonexistent-fake/AGENTS.md"

function makeAgents(names: string[]): Record<string, Record<string, unknown>> {
  const agents: Record<string, Record<string, unknown>> = {}
  for (const n of names) agents[n] = { prompt: `${n} BASE` }
  return agents
}

async function hookThrows(tool: string): Promise<string | null> {
  const hook = createContextModeEnforcerHook({
    context_mode: { enforce: true },
  } as unknown as MatrixxConfig)
  try {
    await hook["tool.execute.before"](
      { tool, sessionID: "ses_1" } as never,
      { args: {} } as never,
    )
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

describe("B-prime prompt/hook agreement", () => {
  test("enforced subagent is never blocked without a taught substitute", async () => {
    //#given: enforce on with a working substitute
    _setDisciplinePathForTesting(FAKE_PATH)
    setContextModeForPrompts({ enforce: true })
    const agents = makeAgents(["trinity", "mouse"])
    //#when: discipline injected and grep attempted
    injectContextDiscipline(["ctx_search", "ctx_batch_execute", "grep", "glob"], agents)
    const trinityPrompt = (agents["trinity"] as { prompt: string }).prompt
    const mousePrompt = (agents["mouse"] as { prompt: string }).prompt
    const thrown = await hookThrows("grep")
    //#then: prompt omits the blocked fallback and names the substitute; hook blocks naming it too
    expect(trinityPrompt).not.toContain("grep/glob fallback")
    expect(trinityPrompt).toContain("ctx_batch_execute")
    expect(mousePrompt).not.toContain("grep/glob fallback")
    expect(thrown).not.toBeNull()
    expect(thrown as string).toContain("ctx_batch_execute")
  })

  test("warn-only mode keeps the grep/glob fallback and the hook warns", async () => {
    //#given: enforce off
    _setDisciplinePathForTesting(null)
    setContextModeForPrompts({ enforce: false })
    const agents = makeAgents(["trinity"])
    //#when: discipline injected
    injectContextDiscipline(["ctx_search", "grep", "glob"], agents)
    const prompt = (agents["trinity"] as { prompt: string }).prompt
    //#then: fallback advertised, hook does not throw
    expect(prompt).toContain("grep/glob fallback")
    expect(resolveGrepGlobUsable(["grep"], { enforce: false })).toBe(true)
  })

  test("no substitute means no block and the fallback stays advertised", async () => {
    //#given: enforce on but nothing indexed
    _setDisciplinePathForTesting(null)
    setContextModeForPrompts({ enforce: true })
    const agents = makeAgents(["trinity"])
    //#when: discipline injected and grep attempted
    injectContextDiscipline(["ctx_search", "grep"], agents)
    const prompt = (agents["trinity"] as { prompt: string }).prompt
    const thrown = await hookThrows("grep")
    //#then: agent keeps a working path
    expect(prompt).toContain("grep/glob fallback")
    expect(thrown).toBeNull()
  })

  test("discipline cache keys on grep/glob usability", () => {
    //#given: fallback loader (no runtime file)
    _setDisciplinePathForTesting(null)
    _resetDisciplineCacheForTesting()
    //#when: both variants built in either order
    const withTools = buildContextDisciplineSection(true, true)
    const withoutTools = buildContextDisciplineSection(true, false)
    _resetDisciplineCacheForTesting()
    const withoutFirst = buildContextDisciplineSection(true, false)
    const withSecond = buildContextDisciplineSection(true, true)
    const compactWith = buildCompactContextDisciplineSection(true, true)
    const compactWithout = buildCompactContextDisciplineSection(true, false)
    const exploreWith = buildExploreDisciplineSection(true, false, true)
    const exploreWithout = buildExploreDisciplineSection(true, false, false)
    //#then: whichever loads first never leaks into the other variant
    expect(withTools).toContain("grep/glob fallback")
    expect(withoutTools).not.toContain("grep/glob fallback")
    expect(withoutTools).toContain("ctx_batch_execute")
    expect(withoutFirst).toBe(withoutTools)
    expect(withSecond).toBe(withTools)
    expect(compactWith).toContain("grep/glob fallback")
    expect(compactWithout).not.toContain("grep/glob fallback")
    expect(exploreWith).toContain("grep/glob fallback")
    expect(exploreWithout).not.toContain("grep/glob fallback")
  })
})
