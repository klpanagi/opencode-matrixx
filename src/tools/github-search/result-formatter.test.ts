import { describe, expect, test } from "bun:test"
import { formatGithubSearchResult } from "./result-formatter"

describe("formatGithubSearchResult", () => {
  test("formats error", () => {
    //#given
    const result = { hits: [], truncated: false, mode: "code-search" as const, error: "gh CLI not found" }

    //#when
    const out = formatGithubSearchResult(result)

    //#then
    expect(out).toContain("Error")
  })

  test("formats empty hits", () => {
    //#given
    const result = { hits: [], truncated: false, mode: "code-search" as const }

    //#when
    const out = formatGithubSearchResult(result)

    //#then
    expect(out).toBe("No matches found")
  })

  test("formats hits with permalinks", () => {
    //#given
    const result = {
      hits: [
        {
          repo: "tanstack/query",
          path: "packages/react-query/src/useQuery.ts",
          sha: "abc123",
          line: 42,
          text: "export function useQuery()",
          url: "https://github.com/tanstack/query/blob/abc123/packages/react-query/src/useQuery.ts#L42",
        },
      ],
      truncated: false,
      mode: "clone-search" as const,
    }

    //#when
    const out = formatGithubSearchResult(result)

    //#then
    expect(out).toContain("tanstack/query")
    expect(out).toContain("abc123")
    expect(out).toContain("useQuery")
  })
})
