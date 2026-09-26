import { z } from "zod"
import type { V2ToolDefinition, V2ToolsRecord } from "../../plugin/types"
import { githubSearch } from "./cli"
import { MAX_LIMIT } from "./constants"
import { formatGithubSearchResult } from "./result-formatter"

export function createGithubSearchTools(_ctx: { directory: string }): V2ToolsRecord {
  const github_search: V2ToolDefinition = {
    name: "github_search",
    description:
      "Search public GitHub code using local CLIs only (gh, git, rg). " +
      "No third-party remote services. " +
      "Without repo: runs `gh search code` for discovery. " +
      "With repo (owner/name): clones shallow to TMPDIR and searches locally with permalinks. " +
      "Requires gh CLI + auth for discovery (`gh auth login`).",
    input: z.object({
      query: z.string().describe("Code pattern to search for (e.g. \"useQuery(\", \"staleTime:\")"),
      repo: z
        .string()
        .optional()
        .describe("Repository in owner/name format for deep local search (e.g. \"tanstack/query\")"),
      language: z
        .string()
        .optional()
        .describe("Language filter for discovery mode (e.g. \"TypeScript\")"),
      limit: z
        .number()
        .optional()
        .describe(`Max results for discovery mode (1-${MAX_LIMIT}, default 10)`),
    }),
    execute: async (args) => {
      try {
        const result = await githubSearch({
          query: args.query,
          repo: args.repo,
          language: args.language,
          limit: args.limit,
        })
        return { content: await (formatGithubSearchResult(result)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  return { github_search }
}
