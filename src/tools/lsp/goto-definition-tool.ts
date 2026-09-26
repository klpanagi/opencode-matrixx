import { z } from "zod"
import type { V2ToolDefinition } from "../../plugin/types"
import { withLspClient } from "./lsp-client-wrapper"
import { formatLocation } from "./lsp-formatters"
import type { Location, LocationLink } from "./types"

export const lsp_goto_definition: V2ToolDefinition = {
  name: "lsp_goto_definition",
  description: "Jump to symbol definition. Find WHERE something is defined.",
  input: z.object({
    filePath: z.string(),
    line: z.number().min(1).describe("1-based"),
    character: z.number().min(0).describe("0-based"),
  }),
  execute: async (args, _context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.definition(args.filePath, args.line, args.character)) as
          | Location
          | Location[]
          | LocationLink[]
          | null
      })

      if (!result) {
        const output = "No definition found"
        return { content: await (output) }
      }

      const locations = Array.isArray(result) ? result : [result]
      if (locations.length === 0) {
        const output = "No definition found"
        return { content: await (output) }
      }

      const output = locations.map(formatLocation).join("\n")
      return { content: await (output) }
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return { content: await (output) }
    }
  },
}
