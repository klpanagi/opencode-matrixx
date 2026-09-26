import { z } from "zod"
import type { V2ToolDefinition, V2ToolsRecord } from "../../plugin/types"
import { runRg } from "./cli"
import { formatGrepResult } from "./result-formatter"

export function createGrepTools(ctx: { directory: string }): V2ToolsRecord {
  const grep: V2ToolDefinition = {
    name: "grep",
    description:
      "Fast content search tool with safety limits (60s timeout, 10MB output). " +
      "Searches file contents using regular expressions. " +
      "Supports full regex syntax (eg. \"log.*Error\", \"function\\s+\\w+\", etc.). " +
      "Filter files by pattern with the include parameter (eg. \"*.js\", \"*.{ts,tsx}\"). " +
      "Returns file paths with matches sorted by modification time.",
    input: z.object({
      pattern: z.string().describe("The regex pattern to search for in file contents"),
      include: z
        .string()
        .optional()
        .describe("File pattern to include in the search (e.g. \"*.js\", \"*.{ts,tsx}\")"),
      path: z
        .string()
        .optional()
        .describe("The directory to search in. Defaults to the current working directory."),
    }),
    execute: async (args) => {
      try {
        const globs = args.include ? [args.include] : undefined
        const searchPath = args.path ?? ctx.directory
        const paths = [searchPath]

        const result = await runRg({
          pattern: args.pattern,
          paths,
          globs,
          context: 0,
        })

        return { content: await (formatGrepResult(result)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  return { grep }
}
