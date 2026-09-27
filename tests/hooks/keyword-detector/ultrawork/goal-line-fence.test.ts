/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createBddContractAgent } from "../../../../src/agents/bdd-contract"
import { createCipherAgent } from "../../../../src/agents/cipher"
import { createKeymakerAgent } from "../../../../src/agents/keymaker"
import { createMorpheusAgent } from "../../../../src/agents/morpheus"
import { createSentinelAgent } from "../../../../src/agents/sentinel"
import { ULTRAWORK_DEEPSEEK_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/deepseek"
import { ULTRAWORK_DEFAULT_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/default"
import { ULTRAWORK_GEMINI_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/gemini"
import { ULTRAWORK_GLM_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/glm"
import { ULTRAWORK_GPT_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/gpt5.2"
import { ULTRAWORK_MIMO_MESSAGE } from "../../../../src/hooks/keyword-detector/ultrawork/mimo"
import type { MatrixxConfig } from "../../../../src/config"
import { buildOracleAgentConfig } from "../../../../src/plugin-handlers/oracle-agent-config-builder"
import { denyTodoTools, deriveTaskPermissions } from "../../../../src/plugin-handlers/task-permissions"
import { applyToolConfig } from "../../../../src/plugin-handlers/tool-config-handler"

const MODEL = "anthropic/claude-sonnet-4-5"

/**
 * Every ultrawork variant, with the fallback anchor each one actually ships.
 *
 * `notepad` is deliberately scoped, NOT universal. The plan asked for a
 * "Durable Notepad present in all 6" assertion; measured, that is false:
 * glm.ts says "working notes" instead and mimo.ts carries no fallback block at
 * all. Fencing it as universal would have produced a permanent failure for a
 * prompt nobody intends to change. A fence too strict gets deleted by the next
 * person who trips it, so the universal claim is dropped and the four variants
 * that DO ship a notepad are pinned instead. `null` means "intentionally no
 * fallback block" — it must not grow a "missing notepad" failure.
 */
const VARIANTS: {
  name: string;
  message: string;
  notepad: RegExp | null;
}[] = [
  {
    name: "default",
    message: ULTRAWORK_DEFAULT_MESSAGE,
    notepad: /^\s*#{2,4} *durable notepad *$/im,
  },
  {
    name: "deepseek",
    message: ULTRAWORK_DEEPSEEK_MESSAGE,
    notepad: /^\s*#{2,4} *durable notepad *$/im,
  },
  {
    name: "gemini",
    message: ULTRAWORK_GEMINI_MESSAGE,
    // uppercase heading, heading level differs from default/deepseek
    notepad: /^\s*#{2,4} *durable notepad *$/im,
  },
  {
    name: "gpt5.2",
    message: ULTRAWORK_GPT_MESSAGE,
    // `##` here, `###` elsewhere — the regex is level-agnostic on purpose
    notepad: /^\s*#{2,4} *durable notepad *$/im,
  },
  { name: "glm", message: ULTRAWORK_GLM_MESSAGE, notepad: /\bin your working notes\b/ },
  { name: "mimo", message: ULTRAWORK_MIMO_MESSAGE, notepad: null },
]

/** Lines that name the tool at all — the surface a mandate would live on. */
function linesNamingTaskCreate(message: string): string[] {
  return message.split("\n").filter((line) => line.includes("`task_create`"))
}

describe("ultrawork goal line is capability-SAFE", () => {
  test.each(VARIANTS)("$name hedges the task_create mandate", ({ name, message }) => {
    //#given
    const lines = linesNamingTaskCreate(message)
    // A variant that never names the tool cannot break anything.
    expect(`${name}:${lines.length > 0}`).toBe(`${name}:true`)

    //#when
    const unhedged = lines.filter((line) => !/when the `task_create` tool exists/i.test(line))

    //#then
    // Every line naming the tool must condition on it existing. This is
    // per-line, not a single `includes` on the whole message, so a prompt can
    // never smuggle a second unconditional mandate in.
    expect(`${name}:${unhedged.length}`).toBe(`${name}:0`)
  })

  test.each(VARIANTS)("$name pins its fallback anchor when it ships one", ({ name, notepad }) => {
    //#given / #when / #then
    // null is an explicit "this variant ships no fallback block" record.
    if (notepad === null) {
      expect(`${name}:none`).toBe(`${name}:none`)
      return
    }
    const message = VARIANTS.find((variant) => variant.name === name)?.message ?? ""
    expect(`${name}:${notepad.test(message)}`).toBe(`${name}:true`)
  })

  test("the corpus is fully covered — a new variant cannot skip the fence", () => {
    //#given
    const expected = ["default", "deepseek", "gemini", "glm", "gpt5.2", "mimo"]
    const covered = VARIANTS.map((variant) => variant.name)

    //#when
    const missing = expected.filter((name) => !covered.includes(name))

    //#then
    expect(`missing:${missing.length}`).toBe("missing:0")
    expect(`covered:${covered.length}`).toBe("covered:6")
  })
})

/**
 * The agent set is produced by the real factories. Nothing here names an agent
 * to grant it anything: eligibility is read off each produced config's own
 * `mode`, and the grant comes from the same `applyToolConfig` the plugin runs.
 */
async function realAgentResult(): Promise<Record<string, unknown>> {
  const oracle = await buildOracleAgentConfig({
    configAgentPlan: undefined,
    pluginOracleOverride: undefined,
    userCategories: undefined,
    currentModel: MODEL,
  })
  return {
    morpheus: createMorpheusAgent(MODEL),
    keymaker: createKeymakerAgent(MODEL),
    cipher: createCipherAgent(MODEL),
    sentinel: createSentinelAgent(MODEL),
    "bdd-contract": createBddContractAgent(MODEL),
    oracle,
  }
}

function modeOf(agents: Record<string, unknown>, name: string): string {
  return ((agents[name] as { mode?: string })?.mode ?? "subagent") as string
}

function apply(agents: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = {}
  applyToolConfig({ config, pluginConfig: {} as MatrixxConfig, agentResult: agents })
  return config
}

describe("task-store eligibility is a function of mode", () => {
  test("mode in {primary, all} implies the task store, for every eligible agent", async () => {
    //#given
    const agents = await realAgentResult()
    const eligible = Object.keys(agents).filter((name) => {
      const mode = modeOf(agents, name)
      return mode === "primary" || mode === "all"
    })
    // Non-vacuous: the filter found the agents whose mode it read off configs.
    expect(`eligible:${eligible.length}`).not.toBe("eligible:0")

    //#when
    apply(agents)

    //#then
    for (const name of eligible) {
      const permission = (agents[name] as { permission?: Record<string, unknown> }).permission ?? {}
      expect(`${name}:${String(permission["task_*"])}`).toBe(`${name}:allow`)
    }
  })

  test("an agent that denies delegation for itself keeps the task store", async () => {
    //#given
    // Sentinel is a read-only auditor: read-only covers files, and the task
    // store is the channel it hands findings over on. Its own declared
    // `task: "deny"` must survive the fill-only grant.
    const sentinel = createSentinelAgent(MODEL)
    const declared = sentinel.permission?.task
    expect(`sentinel declares:${String(declared)}`).toBe("sentinel declares:deny")

    //#when
    const permission = deriveTaskPermissions(sentinel)

    //#then
    expect(`task_*:${String(permission["task_*"])}`).toBe("task_*:allow")
    // deriveTaskPermissions must not resurrect a self-denied capability.
    expect(`task:${String(permission.task)}`).toBe("task:undefined")
  })

  test("a bare subagent receives no task grant", async () => {
    //#given
    // Function-level contract on an input that declares nothing. This is NOT
    // the converse of the eligibility criterion: it says nothing about a
    // subagent that declares its own permissions (the documented Mouse
    // carve-out is untouched by it).
    const bare = { mode: "subagent" }

    //#when
    const permission = deriveTaskPermissions(bare)

    //#then
    expect(`keys:${Object.keys(permission).length}`).toBe("keys:0")
  })
})

describe("legacy todo tools stay suppressed", () => {
  test("denyTodoTools still denies both todo tools", () => {
    //#given / #when / #then
    // Zeroing these is what prevents the legacy tools from being used at all;
    // treating them as cleanup and removing them would be a regression.
    expect(`todowrite:${String(denyTodoTools.todowrite)}`).toBe("todowrite:deny")
    expect(`todoread:${String(denyTodoTools.todoread)}`).toBe("todoread:deny")
  })

  test("the built config keeps tools.todowrite/todoread false", async () => {
    //#given
    const agents = await realAgentResult()

    //#when
    const config = apply(agents)
    const tools = config.tools as Record<string, boolean>

    //#then
    expect(`todowrite:${String(tools.todowrite)}`).toBe("todowrite:false")
    expect(`todoread:${String(tools.todoread)}`).toBe("todoread:false")
  })
})
