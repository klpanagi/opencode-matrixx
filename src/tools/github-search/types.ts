export interface GithubSearchHit {
  repo: string
  path: string
  sha?: string
  line?: number
  text?: string
  url?: string
}

export interface GithubSearchResult {
  hits: GithubSearchHit[]
  truncated: boolean
  mode: "code-search" | "clone-search"
  error?: string
}

export interface GithubSearchOptions {
  query: string
  repo?: string
  language?: string
  limit?: number
}
