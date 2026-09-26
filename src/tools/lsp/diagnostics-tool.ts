
import { z } from "zod"
import type { V2ToolDefinition } from "../../plugin/types"
import { DEFAULT_MAX_DIAGNOSTICS } from "./constants"
import { withLspClient } from "./lsp-client-wrapper"
import { filterDiagnosticsBySeverity, formatDiagnostic } from "./lsp-formatters"
import type { Diagnostic } from "./types"

export const lsp_diagnostics: V2ToolDefinition = {
  name: "lsp_diagnostics",
  description: "Get errors, warnings, hints from language server BEFORE running build.",
  input: z.object({
    filePath: z.string(),
    severity: z
      .enum(["error", "warning", "information", "hint", "all"])
      .optional()
      .describe("Filter by severity level"),
  }),
  execute: async (args, _context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.diagnostics(args.filePath)) as { items?: Diagnostic[] } | Diagnostic[] | null
      })

      let diagnostics: Diagnostic[] = []
      if (result) {
        if (Array.isArray(result)) {
          diagnostics = result
        } else if (result.items) {
          diagnostics = result.items
        }
      }

      diagnostics = filterDiagnosticsBySeverity(diagnostics, args.severity)

      if (diagnostics.length === 0) {
        const output = "No diagnostics found"
        return { content: await (output) }
      }

      const total = diagnostics.length
      const truncated = total > DEFAULT_MAX_DIAGNOSTICS
      const limited = truncated ? diagnostics.slice(0, DEFAULT_MAX_DIAGNOSTICS) : diagnostics
      const lines = limited.map(formatDiagnostic)
      if (truncated) {
        lines.unshift(`Found ${total} diagnostics (showing first ${DEFAULT_MAX_DIAGNOSTICS}):`)
      }
      const output = lines.join("\n")
      return { content: await (output) }
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      throw new Error(output)
    }
  },
}
