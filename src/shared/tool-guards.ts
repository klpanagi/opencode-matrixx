/**
 * Shared tool name guard functions.
 * Used by multiple hooks to check tool types (read/write).
 */

/**
 * Check if a tool name represents a read operation.
 * @param toolName - The tool name to check (case-insensitive)
 * @returns true if the tool is a read tool
 */
export function isReadTool(toolName: string): boolean {
  return toolName.toLowerCase() === "read"
}

/**
 * Check if a tool name represents a write operation.
 * @param toolName - The tool name to check (case-insensitive)
 * @returns true if the tool is a write tool
 */
export function isWriteTool(toolName: string): boolean {
  return toolName.toLowerCase() === "write"
}
