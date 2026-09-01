export interface ThinkModeState {
  requested: boolean
  modelSwitched: boolean
  thinkingConfigInjected: boolean
  providerID?: string
  modelID?: string
}

interface ModelRef {
  providerID: string
  modelID: string
}

interface MessageWithModel {
  model?: ModelRef
  tool_choice?: unknown
  toolChoice?: unknown
  tools?: unknown[]
}

export interface ThinkModeInput {
  parts: Array<{ type: string; text?: string }>
  message: MessageWithModel
}
