import { z } from "zod"
import type { V2ToolDefinition, V2ToolsRecord } from "../../plugin/types"
import { runSg } from "./cli"
import { CLI_LANGUAGES } from "./constants"
import { getPatternHint } from "./pattern-hints"
import { formatReplaceResult, formatSearchResult } from "./result-formatter"
import {
  AST_GREP_REPLACE_DESCRIPTION,
  AST_GREP_SEARCH_DESCRIPTION,
  AST_GREP_SEARCH_PATTERN_PARAM,
} from "./tool-descriptions"
import type { CliLanguage } from "./types"

async function showOutputToUser(context: unknown, output: string): Promise<void> {
  const ctx = context as {
    metadata?: (input: { metadata: { output: string } }) => void | Promise<void>
  }
  await ctx.metadata?.({ metadata: { output } })
}

export function createAstGrepTools(ctx: { directory: string }): V2ToolsRecord {
  const ast_grep_search: V2ToolDefinition = {
    name: "ast_grep_search",
    description: AST_GREP_SEARCH_DESCRIPTION,
    input: z.object({
      pattern: z.string().describe(AST_GREP_SEARCH_PATTERN_PARAM),
      lang: z.enum(CLI_LANGUAGES).describe("Target language"),
      paths: z.array(z.string()).optional().describe("Paths to search (default: ['.'])"),
      globs: z.array(z.string()).optional().describe("Include/exclude globs (prefix ! to exclude)"),
      context: z.number().optional().describe("Context lines around match"),
    }),
    execute: async (args, context) => {
      try {
        const result = await runSg({
          pattern: args.pattern,
          lang: args.lang as CliLanguage,
          paths: args.paths ?? [ctx.directory],
          globs: args.globs,
          context: args.context,
        })

        let output = formatSearchResult(result)

        if (result.matches.length === 0 && !result.error) {
          const hint = getPatternHint(args.pattern, args.lang as CliLanguage)
          if (hint) {
            output += `\n\n${hint}`
          }
        }

        await showOutputToUser(context, output)
        return { content: await (output) }
      } catch (e) {
        const output = `Error: ${e instanceof Error ? e.message : String(e)}`
        await showOutputToUser(context, output)
        return { content: await (output) }
      }
    },
  }

  const ast_grep_replace: V2ToolDefinition = {
    name: "ast_grep_replace",
    description: AST_GREP_REPLACE_DESCRIPTION,
    input: z.object({
      pattern: z.string().describe("AST pattern to match"),
      rewrite: z.string().describe("Replacement pattern (can use $VAR from pattern)"),
      lang: z.enum(CLI_LANGUAGES).describe("Target language"),
      paths: z.array(z.string()).optional().describe("Paths to search"),
      globs: z.array(z.string()).optional().describe("Include/exclude globs"),
      dryRun: z.boolean().optional().describe("Preview changes without applying (default: true)"),
    }),
    execute: async (args, context) => {
      try {
        const result = await runSg({
          pattern: args.pattern,
          rewrite: args.rewrite,
          lang: args.lang as CliLanguage,
          paths: args.paths ?? [ctx.directory],
          globs: args.globs,
          updateAll: args.dryRun === false,
        })
        const output = formatReplaceResult(result, args.dryRun !== false)
        await showOutputToUser(context, output)
        return { content: await (output) }
      } catch (e) {
        const output = `Error: ${e instanceof Error ? e.message : String(e)}`
        await showOutputToUser(context, output)
        return { content: await (output) }
      }
    },
  }

  return { ast_grep_search, ast_grep_replace }
}
