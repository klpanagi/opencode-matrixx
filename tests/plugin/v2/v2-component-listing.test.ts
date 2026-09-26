/// <reference types="bun-types" />

/**
 * Wave 9.1 — the V2 registration *listing* contract.
 *
 * This file answers the two questions Wave 10's shim-removal gate needs:
 *   1. What does V2 actually register for commands and skills? (full enumeration)
 *   2. What can V2 actually do for agents? (a hard, measured constraint)
 *
 * Hard finding under test: the V2 `AgentEditor` surface
 * (`node_modules/@opencode/plugin/dist/promise/agent.d.ts`, lines 2-8) declares
 * ONLY `list`, `get`, `default`, `update`, `remove`. There is no `add`, so a V2
 * plugin can never INTRODUCE an agent — it can only REFINE one that the runtime
 * has already resolved. Every agent assertion below is written against that
 * reality rather than against an aspirational 14-agent V2 listing.
 */

import { describe, expect, test } from "bun:test"
import type { MatrixxConfig } from "../../../src/config"
import { BuiltinAgentNameSchema } from "../../../src/config/schema/agent-names"
import { BuiltinCommandNameSchema } from "../../../src/config/schema/commands"
import { loadBuiltinCommands } from "../../../src/features/builtin-commands"
import { createBuiltinSkills } from "../../../src/features/builtin-skills"
import type {
  V2ComponentRegistrar,
  V2SkillInfo,
} from "../../../src/plugin/v2/component-types"
import { partitionAgentsForV2 } from "../../../src/plugin/v2/agent-partition"

const BUILTIN_AGENT_COUNT = 14

type DomainName = "agent" | "skill" | "command" | "mcp"

type FakeCtx = V2ComponentRegistrar & {
  transformCalls: DomainName[]
  reloadCalls: DomainName[]
  addedSkills: V2SkillInfo[]
  addedCommands: string[]
  updatedAgents: string[]
  defaultAgent?: string
}

/**
 * The fake `agent` editor deliberately exposes ONLY the five members the real
 * `AgentEditor` declares. If any production code ever reaches for `add`, this
 * fake throws instead of silently succeeding, so the constraint is executable
 * rather than a comment.
 */
function createFakeCtx(existingAgentIds: string[] = []): FakeCtx {
  const transformCalls: DomainName[] = []
  const reloadCalls: DomainName[] = []
  const addedSkills: V2SkillInfo[] = []
  const addedCommands: string[] = []
  const updatedAgents: string[] = []
  let defaultAgent: string | undefined

  const domain = (name: DomainName) => ({
    transform: async (callback: (editor: never) => void) => {
      transformCalls.push(name)
      if (name === "agent") {
        callback({
          list: () => existingAgentIds.map((id) => ({ id })),
          get: (id: string) =>
            existingAgentIds.includes(id) ? { id } : undefined,
          default: (id: string | undefined) => {
            defaultAgent = id
          },
          update: (id: string) => updatedAgents.push(id),
          remove: (id: string) => updatedAgents.push(`removed:${id}`),
          add: () => {
            throw new Error(
              "V2 AgentEditor has no add(); this fake guards the Wave 9.1 limitation",
            )
          },
        } as never)
      } else if (name === "skill") {
        callback({
          get: () => undefined,
          add: (skill: V2SkillInfo) => addedSkills.push(skill),
        } as never)
      } else if (name === "command") {
        callback({
          add: (definition: { name: string }) => addedCommands.push(definition.name),
        } as never)
      } else {
        callback({ set: () => undefined } as never)
      }
      return { dispose: async () => undefined }
    },
    reload: async () => {
      reloadCalls.push(name)
    },
  })

  return {
    agent: domain("agent"),
    skill: domain("skill"),
    command: domain("command"),
    mcp: domain("mcp"),
    session: {
      prompt: async () => undefined as never,
    },
    transformCalls,
    reloadCalls,
    addedSkills,
    addedCommands,
    updatedAgents,
    get defaultAgent() {
      return defaultAgent
    },
  } as FakeCtx
}

function createDeps(overrides: Partial<MatrixxConfig> = {}) {
  return {
    directory: "/tmp/matrixx-v2-listing",
    availableToolNames: [] as string[],
    pluginConfig: {
      disabled_agents: [],
      disabled_skills: [],
      disabled_commands: [],
      disabled_mcps: ["websearch", "document_reader", "context7"],
      ...overrides,
    } as MatrixxConfig,
  }
}

describe("V2 registration listing — commands", () => {
  test("the builtin command registry resolves 19 command names", () => {
    //#given
    const registry = loadBuiltinCommands([])

    //#when
    const names = Object.keys(registry).sort()

    //#then
    expect(names).toEqual([
      "assembly",
      "bdd-pipeline",
      "cancel-loop",
      "cleanup-tasks",
      "end-ultrawork",
      "evolution",
      "handoff",
      "init-deep",
      "matrix-loop",
      "pickup",
      "preset",
      "refactor",
      "remove-deadcode",
      "research",
      "start-work",
      "stop-continuation",
      "task-list",
      "ultrawork",
      "ulw-loop",
    ])
  })

  test("the disable-enum schema covers 14 of the 19 registered commands", () => {
    //#given
    const registry = loadBuiltinCommands([])
    const registered = new Set(Object.keys(registry))

    //#when
    const names = BuiltinCommandNameSchema.options

    //#then
    // Documented gap, not a bug introduced by this wave: the 5 names below are
    // registered by V1 and V2 alike but are NOT individually disable-able.
    const notDisableable = [...registered].filter((n) => !names.includes(n as never))
    expect(names).toHaveLength(14)
    expect(notDisableable.sort()).toEqual([
      "cleanup-tasks",
      "evolution",
      "pickup",
      "remove-deadcode",
      "task-list",
    ])
  })
})

describe("V2 registration listing — skills", () => {
  test("the builtin skill registry resolves 44 skills with a name and template", () => {
    //#given
    const skills = createBuiltinSkills({
      browserProvider: "playwright",
      disabledSkills: new Set(),
    })

    //#when
    const names = skills.map((skill) => skill.name)

    //#then
    expect(skills).toHaveLength(44)
    expect(new Set(names).size).toBe(44)
    for (const skill of skills) {
      expect(skill.name.length).toBeGreaterThan(0)
      expect(skill.template.length).toBeGreaterThan(0)
    }
  })

  test("a disabled skill is absent from the listing", () => {
    //#given
    const disabledSkills = new Set(["tdd-enforcer"])

    //#when
    const names = createBuiltinSkills({
      browserProvider: "playwright",
      disabledSkills,
    }).map((skill) => skill.name)

    //#then
    expect(names).not.toContain("tdd-enforcer")
  })
})

describe("V2 registration listing — agents (AgentEditor limitation)", () => {
  test("the 14 builtin agents are enumerated by BuiltinAgentNameSchema", () => {
    //#given
    const names = BuiltinAgentNameSchema.options

    //#when
    const sorted = [...names].sort()

    //#then
    expect(names).toHaveLength(BUILTIN_AGENT_COUNT)
    expect(sorted).toEqual([
      "architect",
      "bdd-contract",
      "cipher",
      "construct",
      "keymaker",
      "merovingian",
      "morpheus",
      "operator",
      "oracle",
      "sati",
      "sentinel",
      "seraph",
      "smith",
      "trinity",
    ])
  })

  test("against an editor holding no agents, all 14 are reported unresolvable", () => {
    //#given an empty runtime — the worst case, where OpenCode resolved nothing
    const editor = createFakeCtx([]).agent.transform

    //#when
    const result = partitionAgentsForV2(
      BuiltinAgentNameSchema.options.map((name) => [name, { system: name }] as const),
      { get: () => undefined },
    )

    //#then
    expect(editor).toBeDefined()
    expect(result.refined).toEqual([])
    expect(result.unresolvable).toHaveLength(BUILTIN_AGENT_COUNT)
  })

  test("against an editor holding every agent, all 14 are refined in place", () => {
    //#given an editor that resolved the full set
    const existing = BuiltinAgentNameSchema.options
    const result = partitionAgentsForV2(
      existing.map((name) => [name, { system: name }] as const),
      { get: (id: string) => (existing.includes(id as never) ? { id } : undefined) },
    )

    //#when
    const refinedNames = result.refined.map(([id]) => id)

    //#then
    expect(refinedNames).toHaveLength(BUILTIN_AGENT_COUNT)
    expect(result.unresolvable).toEqual([])
  })

  test("refined and unresolvable partition the input exactly once each", () => {
    //#given a partial runtime: only 3 of the 14 agents exist
    const existing = ["morpheus", "oracle", "mouse"]
    const input = [...BuiltinAgentNameSchema.options, "mouse"]

    //#when
    const result = partitionAgentsForV2(
      input.map((name) => [name, {}] as const),
      { get: (id: string) => (existing.includes(id) ? { id } : undefined) },
    )

    //#then
    expect(result.refined.map(([id]) => id)).toEqual(["morpheus", "oracle", "mouse"])
    expect(result.unresolvable).toHaveLength(input.length - 3)
    expect(result.refined.length + result.unresolvable.length).toBe(input.length)
  })
})
