import { describe, expect, test } from "bun:test"
import {
  AgentOverrideConfigSchema,
  CommandOverrideConfigSchema,
  ExperimentalConfigSchema,
  HookNameSchema,
  MatrixxConfigSchema,
  ToolGatingConfigSchema,
  V1_TO_V2_AGENT_NAMES,
  V1_TO_V2_HOOK_NAMES,
  V2AgentNameSchema,
  V2HookNameSchema,
  V2SkillsConfigSchema,
} from "../../src/config/schema"
import { mergeConfigs } from "../../src/plugin-config"
import type { MatrixxConfig } from "../../src/config"

describe("V2 plugins schema", () => {
  test("accepts an array of V2 plugin refs", () => {
    //#given
    const config = { plugins: ["opencode-matrixx", "file:///tmp/other.js"] }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.plugins).toEqual(["opencode-matrixx", "file:///tmp/other.js"])
    }
  })

  test("plugins is optional and absent by default", () => {
    //#given
    const config = {}

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.plugins).toBeUndefined()
    }
  })

  test("rejects non-string plugin refs", () => {
    //#given
    const config = { plugins: [123] }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 mcp.servers schema", () => {
  test("accepts a registry of named MCP servers", () => {
    //#given
    const config = {
      mcp: {
        servers: {
          context7: { type: "local", command: "npx", args: ["-y", "context7"], enabled: true },
          remote: { type: "remote", url: "https://example.com/mcp" },
        },
      },
    }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mcp?.servers?.context7?.command).toBe("npx")
      expect(result.data.mcp?.servers?.remote?.url).toBe("https://example.com/mcp")
    }
  })

  test("mcp is optional and absent by default", () => {
    //#given
    const config = {}

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mcp).toBeUndefined()
    }
  })

  test("rejects a server with a non-boolean enabled flag", () => {
    //#given
    const config = { mcp: { servers: { bad: { enabled: "yes" } } } }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 permissions schema", () => {
  test("accepts ordered allow/deny/ask lists", () => {
    //#given
    const config = {
      permissions: { allow: ["read"], deny: ["bash"], ask: ["write"] },
    }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.permissions).toEqual({
        allow: ["read"],
        deny: ["bash"],
        ask: ["write"],
      })
    }
  })

  test("permissions is optional and absent by default", () => {
    //#given
    const config = {}

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.permissions).toBeUndefined()
    }
  })

  test("rejects non-string permission entries", () => {
    //#given
    const config = { permissions: { deny: [42] } }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 experimental.policies schema", () => {
  test("accepts an ordered policy list", () => {
    //#given
    const config = {
      experimental: {
        policies: [
          { effect: "deny", tools: ["bash"] },
          { effect: "allow", agents: ["oracle"] },
        ],
      },
    }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.experimental?.policies?.[0]?.effect).toBe("deny")
      expect(result.data.experimental?.policies?.[1]?.effect).toBe("allow")
    }
  })

  test("policies is optional", () => {
    //#given
    const config = { experimental: { task_system: true } }

    //#when
    const result = ExperimentalConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.policies).toBeUndefined()
    }
  })

  test("rejects a policy with an invalid effect", () => {
    //#given
    const config = { experimental: { policies: [{ effect: "block" }] } }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 hook name mapping", () => {
  const v2Names = [
    "execute.before",
    "execute.after",
    "prompt",
    "context",
    "compaction",
    "generate",
    "title",
    "model.request",
    "retry",
    "evaluate",
  ] as const

  test("V2HookNameSchema accepts every V2 hook name", () => {
    for (const name of v2Names) {
      //#given
      const candidate = name

      //#when
      const result = V2HookNameSchema.safeParse(candidate)

      //#then
      expect(result.success).toBe(true)
    }
  })

  test("V1_TO_V2_HOOK_NAMES maps the six real renames", () => {
    //#given / #when
    const mapping = V1_TO_V2_HOOK_NAMES

    //#then
    expect(mapping["chat.message"]).toBe("prompt")
    expect(mapping["chat.params"]).toBe("generate")
    expect(mapping["tool.execute.before"]).toBe("execute.before")
    expect(mapping["tool.execute.after"]).toBe("execute.after")
    expect(mapping["experimental.chat.messages.transform"]).toBe("context")
    expect(mapping["experimental.session.compacting"]).toBe("compaction")
  })

  test("existing HookNameSchema V1 behavior is unchanged", () => {
    //#given
    const v1Name = "task-continuation-enforcer"
    const v2Name = "prompt"

    //#when
    const v1Result = HookNameSchema.safeParse(v1Name)
    const v2Result = HookNameSchema.safeParse(v2Name)

    //#then
    expect(v1Result.success).toBe(true)
    expect(v2Result.success).toBe(false)
  })

  test("existing deprecated anthropic alias still transforms", () => {
    //#given
    const alias = "anthropic-context-window-limit-recovery"

    //#when
    const result = HookNameSchema.safeParse(alias)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe("context-window-limit-recovery")
    }
  })
})

describe("V2 agent name mapping", () => {
  test("V2AgentNameSchema accepts a known agent", () => {
    //#given
    const name = "morpheus"

    //#when
    const result = V2AgentNameSchema.safeParse(name)

    //#then
    expect(result.success).toBe(true)
  })

  test("V1_TO_V2_AGENT_NAMES covers all 14 builtin agents as identity", () => {
    //#given / #when
    const mapping = V1_TO_V2_AGENT_NAMES

    //#then
    expect(Object.keys(mapping)).toHaveLength(14)
    expect(mapping.morpheus).toBe("morpheus")
    expect(mapping.oracle).toBe("oracle")
    expect(mapping["bdd-contract"]).toBe("bdd-contract")
  })

  test("V2AgentNameSchema rejects an unknown agent", () => {
    //#given
    const name = "not-an-agent"

    //#when
    const result = V2AgentNameSchema.safeParse(name)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 agent override fields", () => {
  test("accepts additive system and permissions fields", () => {
    //#given
    const config = {
      system: "You are a read-only planner.",
      permissions: { allow: ["read"], deny: ["bash"] },
    }

    //#when
    const result = AgentOverrideConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.system).toBe("You are a read-only planner.")
      expect(result.data.permissions?.deny).toEqual(["bash"])
    }
  })

  test("existing agent override fields are unchanged", () => {
    //#given
    const config = { model: "openai/gpt-5.2", temperature: 0.2 }

    //#when
    const result = AgentOverrideConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.model).toBe("openai/gpt-5.2")
      expect(result.data.temperature).toBe(0.2)
    }
  })
})

describe("V2 command override fields", () => {
  test("accepts an additive subagent flag", () => {
    //#given
    const config = { subagent: true }

    //#when
    const result = CommandOverrideConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subagent).toBe(true)
    }
  })

  test("subagent is optional", () => {
    //#given
    const config = {}

    //#when
    const result = CommandOverrideConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subagent).toBeUndefined()
    }
  })
})

describe("V2 skills array shape", () => {
  test("accepts an array of named skill entries", () => {
    //#given
    const config = [{ name: "tdd-enforcer", description: "Test-first" }]

    //#when
    const result = V2SkillsConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]?.name).toBe("tdd-enforcer")
    }
  })

  test("accepts an additive subagent flag on a skill entry", () => {
    //#given
    const config = [{ name: "dev-browser", subagent: true }]

    //#when
    const result = V2SkillsConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]?.subagent).toBe(true)
    }
  })

  test("rejects an entry without a name", () => {
    //#given
    const config = [{ description: "no name" }]

    //#when
    const result = V2SkillsConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("V2 config precedence in mergeConfigs", () => {
  test("deep merges mcp.servers across base and override (V2 wins on conflict)", () => {
    //#given
    const base = {
      mcp: { servers: { a: { command: "a" }, shared: { command: "base" } } },
    } as MatrixxConfig
    const override = {
      mcp: { servers: { b: { command: "b" }, shared: { command: "override" } } },
    } as MatrixxConfig

    //#when
    const result = mergeConfigs(base, override)

    //#then
    expect(result.mcp?.servers?.a?.command).toBe("a")
    expect(result.mcp?.servers?.b?.command).toBe("b")
    expect(result.mcp?.servers?.shared?.command).toBe("override")
  })

  test("does not invent V2 keys when both sides are absent", () => {
    //#given
    const base = {} as MatrixxConfig
    const override = {} as MatrixxConfig

    //#when
    const result = mergeConfigs(base, override)

    //#then
    expect(result.plugins).toBeUndefined()
    expect(result.mcp).toBeUndefined()
    expect(result.permissions).toBeUndefined()
  })

  test("accepts V1 and V2 keys side by side", () => {
    //#given
    const config = {
      disabled_hooks: ["task-continuation-enforcer"],
      plugins: ["opencode-matrixx"],
      mcp: { servers: { context7: { command: "npx" } } },
      permissions: { deny: ["bash"] },
      experimental: { policies: [{ effect: "deny", tools: ["bash"] }] },
    }

    //#when
    const result = MatrixxConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.disabled_hooks).toEqual(["task-continuation-enforcer"])
      expect(result.data.plugins).toEqual(["opencode-matrixx"])
      expect(result.data.permissions?.deny).toEqual(["bash"])
    }
  })

  test("tool gating config remains unchanged", () => {
    //#given
    const config = { preset_tools: false }

    //#when
    const result = ToolGatingConfigSchema.safeParse(config)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.preset_tools).toBe(false)
    }
  })
})
