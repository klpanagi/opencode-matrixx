import type { AgentOverrides, BrowserAutomationProvider, CategoriesConfig, ComplexityDowngrades, ModelPresets, ModelRequirements } from "../../config/schema"
import type { BackgroundManager } from "../../features/background-agent"
import type { OpencodeClient } from "./types"

export interface ExecutorContext {
  manager: BackgroundManager
  client: OpencodeClient
  directory: string
  userCategories?: CategoriesConfig
  mouseModel?: string
  globalModel?: string
  browserProvider?: BrowserAutomationProvider
  agentOverrides?: AgentOverrides
  modelRequirements?: ModelRequirements
  complexityDowngrades?: ComplexityDowngrades
  /** Named model presets from plugin config (`model_presets`). */
  modelPresets?: ModelPresets
  /** Active preset name from plugin config (`active_preset`). */
  activePreset?: string
  /** Invoking (parent) session ID — its preset overlay propagates to delegated tasks. */
  sessionID?: string
  onSyncSessionCreated?: (event: { sessionID: string; parentID: string; title: string }) => Promise<void>
}

export interface ParentContext {
  sessionID: string
  messageID: string
  agent?: string
  model?: { providerID: string; modelID: string; variant?: string }
}

export interface SessionMessage {
  info?: {
    id?: string
    role?: string
    time?: { created?: number }
    finish?: string
    agent?: string
    model?: { providerID: string; modelID: string; variant?: string }
    modelID?: string
    providerID?: string
    variant?: string
  }
  parts?: Array<{ type?: string; text?: string }>
}
