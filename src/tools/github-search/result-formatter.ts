import { DEFAULT_MAX_OUTPUT_CHARS } from "./constants"
import type { GithubSearchResult } from "./types"

export function formatGithubSearchResult(result: GithubSearchResult): string {
  if (result.error) {
    return `Error: ${result.error}`
  }
  if (result.hits.length === 0) {
    return "No matches found"
  }
  const lines: string[] = []
  lines.push(`Found ${result.hits.length} match(es) [${result.mode}]`)
  lines.push("")
  for (const hit of result.hits) {
    const loc = hit.line ? `${hit.path}#L${hit.line}` : hit.path
    lines.push(`${hit.repo} ${loc}`)
    if (hit.url) lines.push(`  ${hit.url}`)
    if (hit.text?.trim()) lines.push(`  ${hit.text.trim().slice(0, 300)}`)
    lines.push("")
  }
  let out = lines.join("\n")
  if (out.length > DEFAULT_MAX_OUTPUT_CHARS) {
    out = `${out.slice(0, DEFAULT_MAX_OUTPUT_CHARS)}\n[Output truncated due to size limit]`
  } else if (result.truncated) {
    out += "[Output truncated due to size limit]"
  }
  return out
}
