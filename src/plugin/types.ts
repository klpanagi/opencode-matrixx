import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"

import type { V1_HOOK_KEYS } from "../config/schema/hooks-v1-keys"

export type PluginContext = Parameters<Plugin>[0]

/** The minimal slice of the V1 plugin context a unit actually reads, e.g. `PluginContextSlice<"directory">`. */
export type PluginContextSlice<K extends keyof PluginContext> = Pick<PluginContext, K>

export type PluginInstance = Awaited<ReturnType<Plugin>>
export type PluginInterface = Omit<PluginInstance, typeof V1_HOOK_KEYS.sessionCompacting>

export type ToolsRecord = Record<string, ToolDefinition>

export type TmuxConfig = {
  enabled: boolean
  layout: "main-horizontal" | "main-vertical" | "tiled" | "even-horizontal" | "even-vertical"
  main_pane_size: number
  main_pane_min_width: number
  agent_pane_min_width: number
}

export type V2PluginDefinition = Parameters<typeof import("@opencode/plugin").Plugin.define>[0]
export type V2PluginContext = Parameters<V2PluginDefinition["setup"]>[0]
export type V2PluginCleanup = Awaited<ReturnType<V2PluginDefinition["setup"]>>

export type V2ToolDomain = V2PluginContext["tool"]
export type V2ToolTransform = V2ToolDomain["transform"]
export type V2ToolEditor = Parameters<Parameters<V2ToolTransform>[0]>[0]
export type V2ToolRegistration = Awaited<ReturnType<V2ToolTransform>>
export type V2ToolDefinition = Parameters<V2ToolEditor["add"]>[0]
export type V2ToolContext = Parameters<V2ToolDefinition["execute"]>[1]
export type V2ToolResult = Awaited<ReturnType<V2ToolDefinition["execute"]>>
export type V2ToolsRecord = Record<string, V2ToolDefinition>
