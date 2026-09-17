import type { PluginInput } from "@opencode-ai/plugin"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { githubSearch } from "./cli"
import { MAX_LIMIT } from "./constants"
import { formatGithubSearchResult } from "./result-formatter"

export function createGithubSearchTools(_ctx: PluginInput): Record<string, ToolDefinition> {
  const github_search: ToolDefinition = tool({
    description:
      "Search public GitHub code using local CLIs only (gh, git, rg). " +
      "No third-party remote services. " +
      "Without repo: runs `gh search code` for discovery. " +
      "With repo (owner/name): clones shallow to TMPDIR and searches locally with permalinks. " +
      "Requires gh CLI + auth for discovery (`gh auth login`).",
    args: {
      query: tool.schema.string().describe("Code pattern to search for (e.g. \"useQuery(\", \"staleTime:\")"),
      repo: tool.schema
        .string()
        .optional()
        .describe("Repository in owner/name format for deep local search (e.g. \"tanstack/query\")"),
      language: tool.schema
        .string()
        .optional()
        .describe("Language filter for discovery mode (e.g. \"TypeScript\")"),
      limit: tool.schema
        .number()
        .optional()
        .describe(`Max results for discovery mode (1-${MAX_LIMIT}, default 10)`),
    },
    execute: async (args) => {
      try {
        const result = await githubSearch({
          query: args.query,
          repo: args.repo,
          language: args.language,
          limit: args.limit,
        })
        return formatGithubSearchResult(result)
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    },
  })

  return { github_search }
}
