import { z } from "zod"
import type { V2ToolDefinition } from "../../plugin/types"
import { withLspClient } from "./lsp-client-wrapper"
import { formatApplyResult, formatPrepareRenameResult } from "./lsp-formatters"
import type { PrepareRenameDefaultBehavior, PrepareRenameResult, WorkspaceEdit } from "./types"
import { applyWorkspaceEdit } from "./workspace-edit"

export const lsp_prepare_rename: V2ToolDefinition = {
  name: "lsp_prepare_rename",
  description: "Check if rename is valid. Use BEFORE lsp_rename.",
  input: z.object({
    filePath: z.string(),
    line: z.number().min(1).describe("1-based"),
    character: z.number().min(0).describe("0-based"),
  }),
  execute: async (args, _context) => {
    try {
      const result = await withLspClient(args.filePath, async (client) => {
        return (await client.prepareRename(args.filePath, args.line, args.character)) as
          | PrepareRenameResult
          | PrepareRenameDefaultBehavior
          | null
      })
      const output = formatPrepareRenameResult(result)
      return { content: await (output) }
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return { content: await (output) }
    }
  },
}

export const lsp_rename: V2ToolDefinition = {
  name: "lsp_rename",
  description: "Rename symbol across entire workspace. APPLIES changes to all files.",
  input: z.object({
    filePath: z.string(),
    line: z.number().min(1).describe("1-based"),
    character: z.number().min(0).describe("0-based"),
    newName: z.string().describe("New symbol name"),
  }),
  execute: async (args, _context) => {
    try {
      const edit = await withLspClient(args.filePath, async (client) => {
        return (await client.rename(args.filePath, args.line, args.character, args.newName)) as WorkspaceEdit | null
      })
      const result = applyWorkspaceEdit(edit)
      const output = formatApplyResult(result)
      return { content: await (output) }
    } catch (e) {
      const output = `Error: ${e instanceof Error ? e.message : String(e)}`
      return { content: await (output) }
    }
  },
}
