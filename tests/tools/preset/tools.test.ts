import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"

// ---------------------------------------------------------------------------
// Mock fs BEFORE importing the module under test (mirrors dcp-switch-profile)
// ---------------------------------------------------------------------------

let capturedWritePath: string | null = null
let capturedWriteData: string | null = null
const mockExistsSync = mock((_path: string) => false)
const mockMkdirSync = mock((_path: string, _opts?: unknown) => undefined)
const mockReadFileSync = mock((_path: string, _enc: string) => "{}")
const mockWriteFileSync = mock((path: string, data: string) => {
  capturedWritePath = path
  capturedWriteData = data
})

mock.module("node:fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

import { _resetPresetStateForTesting } from "../../../src/features/preset-state/manager"
import { createPresetTool } from "../../../src/tools/preset/tools"

const mockContext: ToolContext = { sessionID: "test-session" } as ToolContext

const PLUGIN_CONFIG = {
  model_presets: {
    eco: {
      default_model: "byteplus-plan/deepseek-v4-flash",
      agents: { oracle: { model: "byteplus-plan/deepseek-v3" } },
      categories: { "bullet-time": { model: "byteplus-plan/deepseek-v4-flash" } },
    },
    flagship: { default_model: "anthropic/claude-opus-4-6" },
  },
  active_preset: "eco",
}

afterAll(() => {
  mock.restore()
})

beforeEach(() => {
  capturedWritePath = null
  capturedWriteData = null
  _resetPresetStateForTesting()
})

describe("preset tool", () => {
  test("creates tool named preset", () => {
    //#given the factory
    //#when created
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#then registered under preset
    expect(tools).toHaveProperty("preset")
  })

  test("list shows presets with active marker", async () => {
    //#given presets with eco active
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when listed
    const out = (await tools.preset.execute({ action: "list" }, mockContext).then((__r) => __r.content)) as string

    //#then both names appear and eco is marked active
    expect(out).toContain("eco")
    expect(out).toContain("flagship")
    expect(out).toContain("(active)")
  })

  test("list with no presets reports empty", async () => {
    //#given no presets configured
    const tools = createPresetTool({ pluginConfig: {} })

    //#when listed
    const out = (await tools.preset.execute({ action: "list" }, mockContext).then((__r) => __r.content)) as string

    //#then helpful message, no throw
    expect(out).toContain("No model presets defined")
  })

  test("show renders preset detail", async () => {
    //#given presets
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when shown
    const out = (await tools.preset.execute({ action: "show", name: "eco" }, mockContext).then((__r) => __r.content)) as string

    //#then detail lines present
    expect(out).toContain('Preset "eco"')
    expect(out).toContain("byteplus-plan/deepseek-v4-flash")
    expect(out).toContain("oracle")
  })

  test("show unknown preset lists available names", async () => {
    //#given presets
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when an unknown preset is shown
    const out = (await tools.preset.execute({ action: "show", name: "nope" }, mockContext).then((__r) => __r.content)) as string

    //#then error names the available presets
    expect(out).toContain("Unknown preset")
    expect(out).toContain("eco")
  })

  test("set stores session overlay and reports delegate-now/builtin-next-session", async () => {
    //#given presets
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when set without save
    const out = (await tools.preset.execute(
      { action: "set", name: "flagship" },
      mockContext,
    ).then((__r) => __r.content)) as string

    //#then confirmation states immediate delegate switch + next-session builtin
    expect(out).toContain("flagship")
    expect(out).toContain("delegate-task categories switch immediately")
    expect(out).toContain("next session")
    // no file written without --save
    expect(capturedWriteData).toBeNull()
  })

  test("set unknown preset errors without side effects", async () => {
    //#given presets
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when an unknown preset is set
    const out = (await tools.preset.execute(
      { action: "set", name: "nope" },
      mockContext,
    ).then((__r) => __r.content)) as string

    //#then error lists available names, nothing written
    expect(out).toContain("Unknown preset")
    expect(capturedWriteData).toBeNull()
  })

  test("set requires a name", async () => {
    //#given presets
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })

    //#when set without a name
    const out = (await tools.preset.execute({ action: "set" }, mockContext).then((__r) => __r.content)) as string

    //#then usage error
    expect(out).toContain("requires a preset name")
  })

  test("set --save persists active_preset to project config", async () => {
    //#given presets and a working directory
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG, directory: "/tmp/proj" })

    //#when set with save
    const out = (await tools.preset.execute(
      { action: "set", name: "flagship", save: true },
      mockContext,
    ).then((__r) => __r.content)) as string

    //#then file written with the new active preset
    expect(capturedWritePath).toBe("/tmp/proj/.opencode/matrixx.jsonc")
    expect(capturedWriteData).toContain('"active_preset": "flagship"')
    expect(out).toContain("Persisted")
  })

  test("session overlay is visible in list output", async () => {
    //#given presets and a session overlay
    const tools = createPresetTool({ pluginConfig: PLUGIN_CONFIG })
    await tools.preset.execute({ action: "set", name: "flagship" }, mockContext).then((__r) => __r.content)

    //#when listed
    const out = (await tools.preset.execute({ action: "list" }, mockContext).then((__r) => __r.content)) as string

    //#then overlay wins over config active_preset
    expect(out).toContain("flagship (active)")
    expect(out).toContain("session overlay")
  })
})
