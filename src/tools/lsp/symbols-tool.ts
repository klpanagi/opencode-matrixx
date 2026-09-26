
import { z } from "zod"
import type { V2ToolDefinition } from "../../plugin/types"
import { DEFAULT_MAX_SYMBOLS } from "./constants"
import { withLspClient } from "./lsp-client-wrapper"
import { formatDocumentSymbol, formatSymbolInfo } from "./lsp-formatters"
import type { DocumentSymbol, SymbolInfo } from "./types"

export const lsp_symbols: V2ToolDefinition = {
  name: "lsp_symbols",
  description:
    "Get symbols from file (document) or search across workspace. Use scope='document' for file outline, scope='workspace' for project-wide symbol search.",
  input: z.object({
    filePath: z.string().describe("File path for LSP context"),
    scope: z
      .enum(["document", "workspace"])
      .default("document")
      .describe("'document' for file symbols, 'workspace' for project-wide search"),
    query: z.string().optional().describe("Symbol name to search (required for workspace scope)"),
    limit: z.number().optional().describe("Max results (default 50)"),
  }),
  execute: async (args, _context) => {
    try {
      const scope = args.scope ?? "document"

      if (scope === "workspace") {
        const query = args.query
        if (!query) {
          return { content: await ("Error: 'query' is required for workspace scope") }
        }

        const result = await withLspClient(args.filePath, async (client) => {
          return (await client.workspaceSymbols(query)) as SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return { content: await ("No symbols found") }
        }

        const total = result.length
        const limit = Math.min(args.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
        const truncated = total > limit
        const limited = result.slice(0, limit)
        const lines = limited.map(formatSymbolInfo)
        if (truncated) {
          lines.unshift(`Found ${total} symbols (showing first ${limit}):`)
        }
        return { content: await (lines.join("\n")) }
      } else {
        const result = await withLspClient(args.filePath, async (client) => {
          return (await client.documentSymbols(args.filePath)) as DocumentSymbol[] | SymbolInfo[] | null
        })

        if (!result || result.length === 0) {
          return { content: await ("No symbols found") }
        }

        const total = result.length
        const limit = Math.min(args.limit ?? DEFAULT_MAX_SYMBOLS, DEFAULT_MAX_SYMBOLS)
        const truncated = total > limit
        const limited = truncated ? result.slice(0, limit) : result

        const lines: string[] = []
        if (truncated) {
          lines.push(`Found ${total} symbols (showing first ${limit}):`)
        }

        if ("range" in limited[0]) {
          lines.push(...(limited as DocumentSymbol[]).map((s) => formatDocumentSymbol(s)))
        } else {
          lines.push(...(limited as SymbolInfo[]).map(formatSymbolInfo))
        }
        return { content: await (lines.join("\n")) }
      }
    } catch (e) {
      return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
    }
  },
}
