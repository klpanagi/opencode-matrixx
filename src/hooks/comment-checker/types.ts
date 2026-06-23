export interface PendingCall {
  filePath: string
  content?: string
  oldString?: string
  newString?: string
  edits?: Array<{ old_string: string; new_string: string }>
  tool: "write" | "edit" | "multiedit"
  sessionID: string
  timestamp: number
}

