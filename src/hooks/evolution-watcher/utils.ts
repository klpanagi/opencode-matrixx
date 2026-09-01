export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…[truncated]`
}

export function classifySuccess(tool: string, output: string): { success: boolean; errorType?: string } {
  const lower = output.toLowerCase()
  if (
    lower.includes("error:") ||
    lower.includes("failed to") ||
    lower.includes("exception") ||
    lower.includes("enoent") ||
    lower.includes("panic") ||
    lower.startsWith("error")
  ) {
    return { success: false, errorType: "generic_error" }
  }
  if (tool === "lsp_diagnostics" && lower.includes("error")) {
    return { success: false, errorType: "diagnostics_error" }
  }
  if ((tool === "edit" || tool === "write") && (lower.includes("mismatch") || lower.includes("not found"))) {
    return { success: false, errorType: "edit_mismatch" }
  }
  return { success: true }
}
