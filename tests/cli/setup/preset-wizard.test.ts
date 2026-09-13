import { describe, expect, test } from "bun:test"
import {
  BuiltinAgentNameSchema,
  type BuiltinAgentName,
} from "../../../src/config/schema/agent-names"
import { BuiltinCategoryNameSchema } from "../../../src/config/schema/categories"
import {
  NO_CONNECTED_PROVIDERS_ERROR,
  buildDefaultPreset,
  runPresetWizard,
} from "../../../src/cli/setup/preset-wizard"

const AGENTS = BuiltinAgentNameSchema.options as readonly string[]
const CATEGORIES = BuiltinCategoryNameSchema.options as readonly string[]

describe("buildDefaultPreset", () => {
  test("assigns the model to every agent and category plus default", () => {
    //#given a model and the builtin registries
    const model = "byteplus-plan/deepseek-v4-flash"

    //#when built
    const preset = buildDefaultPreset(model, AGENTS, CATEGORIES)

    //#then everything points at the model
    expect(preset.default_model).toBe(model)
    for (const name of AGENTS) {
      expect(preset.agents?.[name as BuiltinAgentName]?.model).toBe(model)
    }
    for (const name of CATEGORIES) {
      expect(preset.categories?.[name]?.model).toBe(model)
    }
  })

  test("entries are independent objects", () => {
    //#given a built preset
    const preset = buildDefaultPreset("p/m", ["a"], ["c"])

    //#when one entry is mutated
    preset.agents!.a.model = "p/other"

    //#then siblings are unaffected
    expect(preset.categories!.c.model).toBe("p/m")
    expect(preset.default_model).toBe("p/m")
  })
})

describe("runPresetWizard", () => {
  test("skip flag returns skipped without prompting", async () => {
    //#given skip requested
    //#when run
    const result = await runPresetWizard({ skip: true })

    //#then skipped, no providers needed
    expect(result).toEqual({ status: "skipped" })
  })

  test("no-providers error constant is exact and actionable", () => {
    //#given the exported error string
    //#when inspected
    //#then it names the remediation
    expect(NO_CONNECTED_PROVIDERS_ERROR).toContain("No connected providers detected")
    expect(NO_CONNECTED_PROVIDERS_ERROR).toContain("opencode auth login")
  })
})
