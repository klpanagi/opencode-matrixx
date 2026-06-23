export interface ToolCallSignature {
  toolName: string
  signature: string
  callID: string
  turn: number
}

interface FileOperation {
  callID: string
  tool: string
  filePath: string
  turn: number
}

interface ErroredToolCall {
  callID: string
  toolName: string
  turn: number
  errorAge: number
}

export interface PruningState {
  toolIdsToPrune: Set<string>
  currentTurn: number
  fileOperations: Map<string, FileOperation[]>
  toolSignatures: Map<string, ToolCallSignature[]>
  erroredTools: Map<string, ErroredToolCall>
}

const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}
