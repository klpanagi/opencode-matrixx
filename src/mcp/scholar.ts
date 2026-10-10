import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { ScholarConfig } from "../config/schema/scholar"
import { parseJsonc } from "../shared/jsonc-parser"

// Scholar MCP: federated academic search fronting Semantic Scholar (S2),
// OpenAlex, CrossRef, and arXiv.
//
// Ported from ScholarFlow `backend/app/services/academic_apis.py` (S2 lines
// 45-263, arXiv 264-327, OpenAlex 328-451, CrossRef 452-502) and
// `backend/app/utils/rate_limiters.py` (TokenBucketRateLimiter, monotonic
// clock, arXiv 1/3 RPS burst 1).
//
// Key handling (ScholarFlow `user_api_keys.py` Fernet precedent mapped to
// matrixx-native): keys live in user config (`~/.config/opencode/matrixx.jsonc`)
// only — never project config, never logs. Header injection happens inside
// this MCP process only (`x-api-key` for S2, `mailto:` User-Agent for
// OpenAlex). Errors never carry key material.

export const SCHOLAR_TOOL_NAMES = [
  "scholar_search",
  "scholar_citations",
  "scholar_references",
  "scholar_recommendations",
  "arxiv_search",
  "crossref_resolve",
] as const

export type ScholarToolName = (typeof SCHOLAR_TOOL_NAMES)[number]

export interface PaperResult {
  externalId: string
  source: "semantic_scholar" | "openalex" | "arxiv" | "crossref"
  title: string
  abstract: string | null
  authors: string[]
  year: number | null
  url: string | null
  doi: string | null
  citationCount: number | null
  tldr: string | null
  paperId: string | null
}

// Mocked-fetch seam: injectable fetch for tests. Defaults to global fetch.
export type ScholarFetch = (input: string, init?: RequestInit) => Promise<Response>

export type ScholarClock = () => number
export type ScholarSleep = (ms: number) => Promise<void>

const defaultFetch: ScholarFetch = (input, init) => fetch(input, init)
const defaultNow: ScholarClock = () => performance.now()
const defaultSleep: ScholarSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Port of ScholarFlow TokenBucketRateLimiter: monotonic clock, no jitter.
export class TokenBucketRateLimiter {
  private tokens: number
  private lastRefill: number
  private tail: Promise<void> = Promise.resolve()

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number = 1,
    private readonly now: ScholarClock = defaultNow,
    private readonly sleep: ScholarSleep = defaultSleep,
  ) {
    this.tokens = burst
    this.lastRefill = now()
  }

  get rate(): number {
    return this.ratePerSecond
  }

  get burstSize(): number {
    return this.burst
  }

  async acquire(): Promise<void> {
    const step = this.tail.then(() => this.drain())
    this.tail = step.catch(() => undefined)
    await step
  }

  private async drain(): Promise<void> {
    this.refill()
    while (this.tokens < 1) {
      await this.sleep(((1 - this.tokens) / this.ratePerSecond) * 1000)
      this.refill()
    }
    this.tokens -= 1
  }

  private refill(): void {
    const current = this.now()
    const elapsed = Math.max(0, (current - this.lastRefill) / 1000)
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSecond)
    this.lastRefill = current
  }
}

// Shared limiters (module singletons, mirroring ScholarFlow's singletons):
// S2 anonymous 1 RPS; arXiv verbatim 1/3 RPS burst 1. Keyed S2 calls skip the
// limiter entirely — no RPS ceiling is assumed for keyed use (operator-configured).
export const s2AnonymousLimiter = new TokenBucketRateLimiter(1, 1)
export const arxivRateLimiter = new TokenBucketRateLimiter(1 / 3, 1)

const S2_BASE_URL = "https://api.semanticscholar.org/graph/v1"
const S2_REC_URL = "https://api.semanticscholar.org/recommendations/v1"
const S2_FIELDS = "title,abstract,authors,year,url,externalIds,citationCount"
const OPENALEX_BASE_URL = "https://api.openalex.org"
const ARXIV_BASE_URL = "https://export.arxiv.org/api/query"
const CROSSREF_BASE_URL = "https://api.crossref.org"
const REQUEST_TIMEOUT_MS = 30000
const S2_MAX_ATTEMPTS = 3

export interface ScholarClientOptions {
  s2ApiKey?: string
  mailto?: string
  fetchFn?: ScholarFetch
  sleep?: ScholarSleep
  s2Limiter?: TokenBucketRateLimiter
  arxivLimiter?: TokenBucketRateLimiter
}

interface S2Paper {
  paperId?: string
  title?: string
  abstract?: string | null
  authors?: Array<{ name?: string }>
  year?: number | null
  url?: string | null
  externalIds?: { DOI?: string }
  citationCount?: number | null
  tldr?: { text?: string } | null
  venue?: string | null
}

function fromS2(paper: S2Paper): PaperResult {
  return {
    externalId: paper.paperId ?? "",
    source: "semantic_scholar",
    title: paper.title ?? "",
    abstract: paper.abstract ?? null,
    authors: (paper.authors ?? []).map((a) => a.name ?? ""),
    year: paper.year ?? null,
    url: paper.url ?? null,
    doi: paper.externalIds?.DOI ?? null,
    citationCount: paper.citationCount ?? null,
    tldr: paper.tldr?.text ?? null,
    paperId: paper.paperId ?? null,
  }
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string | null {
  if (!invertedIndex) return null
  try {
    const positioned: Array<[number, string]> = []
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) positioned.push([pos, word])
    }
    positioned.sort((a, b) => a[0] - b[0])
    return positioned.map(([, word]) => word).join(" ")
  } catch {
    return null
  }
}

interface OpenAlexWork {
  id?: string
  title?: string
  abstract_inverted_index?: Record<string, number[]> | null
  authorships?: Array<{ author?: { display_name?: string } }>
  publication_year?: number | null
  primary_location?: { source?: { display_name?: string | null } | null } | null
  doi?: string | null
  cited_by_count?: number | null
}

function fromOpenAlex(item: OpenAlexWork): PaperResult {
  const authors = (item.authorships ?? [])
    .map((a) => a.author?.display_name ?? "")
    .filter((name) => name.length > 0)
  const rawDoi = item.doi ?? ""
  return {
    externalId: item.id ?? "",
    source: "openalex",
    title: item.title ?? "",
    abstract: reconstructAbstract(item.abstract_inverted_index),
    authors,
    year: item.publication_year ?? null,
    url: item.doi ?? item.id ?? null,
    doi: rawDoi ? rawDoi.replace("https://doi.org/", "") : null,
    citationCount: item.cited_by_count ?? null,
    tldr: null,
    paperId: null,
  }
}

function parseArxivFeed(xml: string): PaperResult[] {
  const results: PaperResult[] = []
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  for (const entry of entries) {
    const pick = (tag: string): string | null => {
      const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
      return match?.[1]?.trim() ?? null
    }
    const rawId = pick("id")
    const rawTitle = pick("title")
    const rawSummary = pick("summary")
    const rawPublished = pick("published")
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/)
    const authors: string[] = []
    const authorBlocks = entry.match(/<author>[\s\S]*?<\/author>/g) ?? []
    for (const block of authorBlocks) {
      const name = block.match(/<name[^>]*>([\s\S]*?)<\/name>/)?.[1]?.trim()
      if (name) authors.push(name)
    }
    let year: number | null = null
    if (rawPublished && /^\d{4}/.test(rawPublished)) year = Number.parseInt(rawPublished.slice(0, 4), 10)
    results.push({
      externalId: rawId?.split("/abs/").pop() ?? "",
      source: "arxiv",
      title: (rawTitle ?? "").replace(/\s+/g, " "),
      abstract: rawSummary ?? null,
      authors,
      year,
      url: linkMatch?.[1] ?? null,
      doi: null,
      citationCount: null,
      tldr: null,
      paperId: null,
    })
  }
  return results
}

export class ScholarClient {
  private readonly fetchFn: ScholarFetch
  private readonly sleep: ScholarSleep
  private readonly s2Limiter: TokenBucketRateLimiter
  private readonly arxivRateLimiter: TokenBucketRateLimiter

  constructor(private readonly options: ScholarClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? defaultFetch
    this.sleep = options.sleep ?? defaultSleep
    this.s2Limiter = options.s2Limiter ?? s2AnonymousLimiter
    this.arxivRateLimiter = options.arxivLimiter ?? arxivRateLimiter
  }

  private s2Headers(): Record<string, string> {
    if (this.options.s2ApiKey) return { "x-api-key": this.options.s2ApiKey }
    return {}
  }

  private openAlexHeaders(): Record<string, string> {
    if (this.options.mailto) return { "User-Agent": `mailto:${this.options.mailto}` }
    return {}
  }

  private async acquireS2(): Promise<void> {
    // Anonymous S2: 1 RPS. Keyed S2: no assumed ceiling, limiter skipped.
    if (!this.options.s2ApiKey) await this.s2Limiter.acquire()
  }

  async s2Search(
    query: string,
    opts: { limit?: number; year?: string; minCitations?: number; sort?: string; venue?: string } = {},
  ): Promise<PaperResult[]> {
    await this.acquireS2()
    const headers = this.s2Headers()
    const limit = opts.limit ?? 20
    let fields = S2_FIELDS
    if (opts.venue) fields += ",venue"
    const params = new URLSearchParams({
      query,
      fields,
      sort: opts.sort ?? "citationCount:desc",
    })
    if (opts.year) params.set("year", opts.year)
    if (opts.minCitations) params.set("minCitationCount", String(opts.minCitations))
    for (let attempt = 0; attempt < S2_MAX_ATTEMPTS; attempt += 1) {
      const response = await this.fetchFn(`${S2_BASE_URL}/paper/search/bulk?${params}`, {
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 200) {
        const data = (await response.json()) as { data?: S2Paper[] }
        let papers = (data.data ?? []).slice(0, limit)
        if (opts.venue) {
          const venue = opts.venue.toLowerCase()
          papers = papers.filter((p) => (p.venue ?? "").toLowerCase().includes(venue))
        }
        return papers.map(fromS2)
      }
      if (response.status === 429) {
        await this.sleep(2 ** attempt * 1000)
        continue
      }
      return []
    }
    return []
  }

  async s2Citations(paperId: string, limit = 50): Promise<PaperResult[]> {
    await this.acquireS2()
    const params = new URLSearchParams({ fields: S2_FIELDS, limit: String(Math.min(limit, 1000)) })
    const response = await this.fetchFn(`${S2_BASE_URL}/paper/${paperId}/citations?${params}`, {
      headers: this.s2Headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    const data = (await response.json()) as { data?: Array<{ citingPaper?: S2Paper }> }
    return (data.data ?? [])
      .filter((entry) => entry.citingPaper)
      .map((entry) => fromS2(entry.citingPaper as S2Paper))
      .slice(0, limit)
  }

  async s2References(paperId: string, limit = 50): Promise<PaperResult[]> {
    await this.acquireS2()
    const params = new URLSearchParams({ fields: S2_FIELDS, limit: String(Math.min(limit, 1000)) })
    const response = await this.fetchFn(`${S2_BASE_URL}/paper/${paperId}/references?${params}`, {
      headers: this.s2Headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    const data = (await response.json()) as { data?: Array<{ citedPaper?: S2Paper }> }
    return (data.data ?? [])
      .filter((entry) => entry.citedPaper)
      .map((entry) => fromS2(entry.citedPaper as S2Paper))
      .slice(0, limit)
  }

  async s2Recommendations(
    positivePaperIds: string[],
    opts: { negativePaperIds?: string[]; limit?: number } = {},
  ): Promise<PaperResult[]> {
    await this.acquireS2()
    const limit = opts.limit ?? 50
    const params = new URLSearchParams({ fields: S2_FIELDS, limit: String(Math.min(limit, 500)) })
    const body: { positivePaperIds: string[]; negativePaperIds?: string[] } = {
      positivePaperIds,
    }
    if (opts.negativePaperIds) body.negativePaperIds = opts.negativePaperIds
    const response = await this.fetchFn(`${S2_REC_URL}/papers?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.s2Headers() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    const data = (await response.json()) as { recommendedPapers?: S2Paper[] }
    return (data.recommendedPapers ?? [])
      .map(fromS2)
      .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
  }

  async openAlexSearch(
    query: string,
    opts: { limit?: number; year?: string; venue?: string; minCitationCount?: number } = {},
  ): Promise<PaperResult[]> {
    const limit = opts.limit ?? 20
    const params = new URLSearchParams({
      search: query,
      per_page: String(Math.min(limit, 200)),
      sort: "relevance_score:desc",
    })
    const filters: string[] = []
    if (opts.year) filters.push(`publication_year:${opts.year}`)
    if (opts.minCitationCount !== undefined) filters.push(`cited_by_count:>${opts.minCitationCount}`)
    if (filters.length > 0) params.set("filter", filters.join(","))
    const response = await this.fetchFn(`${OPENALEX_BASE_URL}/works?${params}`, {
      headers: this.openAlexHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    const data = (await response.json()) as { results?: OpenAlexWork[] }
    const results: PaperResult[] = []
    for (const item of data.results ?? []) {
      if (opts.venue) {
        const itemVenue = item.primary_location?.source?.display_name ?? ""
        if (!itemVenue.toLowerCase().includes(opts.venue.toLowerCase())) continue
      }
      results.push(fromOpenAlex(item))
    }
    return results
  }

  async arxivSearch(query: string, opts: { maxResults?: number; start?: number } = {}): Promise<PaperResult[]> {
    // Verbatim arXiv precedent: acquire before every call, 1/3 RPS burst 1.
    await this.arxivRateLimiter.acquire()
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      start: String(opts.start ?? 0),
      max_results: String(opts.maxResults ?? 20),
    })
    const response = await this.fetchFn(`${ARXIV_BASE_URL}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    return parseArxivFeed(await response.text())
  }

  async crossrefSearch(query: string, opts: { rows?: number; offset?: number } = {}): Promise<PaperResult[]> {
    const params = new URLSearchParams({
      query,
      rows: String(opts.rows ?? 20),
      offset: String(opts.offset ?? 0),
    })
    const response = await this.fetchFn(`${CROSSREF_BASE_URL}/works?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return []
    const data = (await response.json()) as { message?: { items?: CrossRefItem[] } }
    return (data.message?.items ?? []).map(fromCrossRef)
  }

  async crossrefResolve(queryOrDoi: string): Promise<PaperResult | null> {
    const trimmed = queryOrDoi.trim()
    if (/^10\.\d{4,}\//.test(trimmed)) {
      const response = await this.fetchFn(`${CROSSREF_BASE_URL}/works/${encodeURIComponent(trimmed)}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.status === 404) return null
      if (response.status !== 200) return null
      const data = (await response.json()) as { message?: CrossRefItem }
      if (!data.message) return null
      return fromCrossRef(data.message)
    }
    const [top] = await this.crossrefSearch(trimmed, { rows: 1 })
    return top ?? null
  }

  // Federated search: S2 + OpenAlex merged, deduped by DOI, cited-most first.
  async scholarSearch(
    query: string,
    opts: { limit?: number; year?: string; minCitations?: number } = {},
  ): Promise<PaperResult[]> {
    const limit = opts.limit ?? 20
    const [s2, openAlex] = await Promise.all([
      this.s2Search(query, { limit, year: opts.year, minCitations: opts.minCitations }),
      this.openAlexSearch(query, { limit, year: opts.year, minCitationCount: opts.minCitations }),
    ])
    const seen = new Set<string>()
    const merged: PaperResult[] = []
    for (const paper of [...s2, ...openAlex]) {
      const key = (paper.doi ?? "").toLowerCase() || `${paper.source}:${paper.externalId}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(paper)
    }
    merged.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    return merged.slice(0, limit)
  }
}

interface CrossRefAuthor {
  given?: string
  family?: string
}

interface CrossRefItem {
  DOI?: string
  title?: string[]
  abstract?: string | null
  author?: CrossRefAuthor[]
  URL?: string | null
  "published-print"?: { "date-parts"?: Array<Array<number | null>> }
  "is-referenced-by-count"?: number | null
}

function fromCrossRef(item: CrossRefItem): PaperResult {
  const authors = (item.author ?? []).map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim())
  const dateParts = item["published-print"]?.["date-parts"]?.[0]?.[0]
  return {
    externalId: item.DOI ?? "",
    source: "crossref",
    title: item.title?.[0] ?? "",
    abstract: item.abstract ?? null,
    authors,
    year: typeof dateParts === "number" ? dateParts : null,
    url: item.URL ?? null,
    doi: item.DOI ?? null,
    citationCount: item["is-referenced-by-count"] ?? null,
    tldr: null,
    paperId: null,
  }
}

export interface ScholarDossierPaper {
  title: string
  year: number | null
  citationCount: number | null
  doi: string | null
  url: string | null
  source: PaperResult["source"]
  authors: string[]
}

// Dossier shape consumed by V2/V3 literature stages (title/year/citationCount/doi).
export function toScholarDossier(papers: PaperResult[]): ScholarDossierPaper[] {
  return papers.map((p) => ({
    title: p.title,
    year: p.year,
    citationCount: p.citationCount,
    doi: p.doi,
    url: p.url,
    source: p.source,
    authors: p.authors,
  }))
}

// Tool input schemas exposed over MCP tools/list.
export const SCHOLAR_TOOL_INPUT_SCHEMAS: Record<ScholarToolName, Record<string, unknown>> = {
  scholar_search: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
      year: { type: "string" },
      minCitations: { type: "number" },
    },
  },
  scholar_citations: {
    type: "object",
    required: ["paperId"],
    properties: { paperId: { type: "string" }, limit: { type: "number" } },
  },
  scholar_references: {
    type: "object",
    required: ["paperId"],
    properties: { paperId: { type: "string" }, limit: { type: "number" } },
  },
  scholar_recommendations: {
    type: "object",
    required: ["positivePaperIds"],
    properties: {
      positivePaperIds: { type: "array", items: { type: "string" } },
      negativePaperIds: { type: "array", items: { type: "string" } },
      limit: { type: "number" },
    },
  },
  arxiv_search: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
      maxResults: { type: "number" },
      start: { type: "number" },
    },
  },
  crossref_resolve: {
    type: "object",
    required: ["query"],
    properties: { query: { type: "string" } },
  },
}

// MCP registry plumbing (mirrors websearch.ts factory + document-reader.ts shape).
export type ScholarMcpConfig = {
  type: "local"
  command: string[]
  enabled: boolean
}

// Absolute path of this module file when running from source. Null when bundled
// (dist) or otherwise unresolvable — the registry then records a redacted failure.
export function resolveScholarServerEntry(): string | null {
  try {
    const path = fileURLToPath(new URL(import.meta.url))
    if (!path.endsWith("scholar.ts") || !existsSync(path)) return null
    return path
  } catch {
    return null
  }
}

export function createScholarMcpConfig(): ScholarMcpConfig {
  const entry = resolveScholarServerEntry()
  if (!entry) throw new Error("scholar MCP server entrypoint is unavailable in this build")
  return { type: "local" as const, command: ["bun", entry, "--mcp-stdio"], enabled: true }
}

// User-config-only loader for the spawned MCP server process: reads
// ~/.config/opencode/matrixx.jsonc (.json fallback), scholar section only.
export function loadScholarUserConfig(env: NodeJS.ProcessEnv = process.env): ScholarConfig {
  const home = env.HOME ?? env.USERPROFILE ?? ""
  const candidates = [
    `${home}/.config/opencode/matrixx.jsonc`,
    `${home}/.config/opencode/matrixx.json`,
  ]
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const raw = parseJsonc<{ scholar?: unknown }>(readFileSync(path, "utf-8"))
      if (raw.scholar && typeof raw.scholar === "object") return raw.scholar as ScholarConfig
      return {}
    } catch {
      // Unreadable candidate — try the next path.
    }
  }
  return {}
}

async function dispatchTool(client: ScholarClient, name: string, args: Record<string, unknown>): Promise<PaperResult | PaperResult[] | null> {
  switch (name) {
    case "scholar_search":
      return client.scholarSearch(String(args.query ?? ""), {
        limit: typeof args.limit === "number" ? args.limit : undefined,
        year: typeof args.year === "string" ? args.year : undefined,
        minCitations: typeof args.minCitations === "number" ? args.minCitations : undefined,
      })
    case "scholar_citations":
      return client.s2Citations(String(args.paperId ?? ""), typeof args.limit === "number" ? args.limit : undefined)
    case "scholar_references":
      return client.s2References(String(args.paperId ?? ""), typeof args.limit === "number" ? args.limit : undefined)
    case "scholar_recommendations":
      return client.s2Recommendations(Array.isArray(args.positivePaperIds) ? args.positivePaperIds.map(String) : [], {
        negativePaperIds: Array.isArray(args.negativePaperIds) ? args.negativePaperIds.map(String) : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      })
    case "arxiv_search":
      return client.arxivSearch(String(args.query ?? ""), {
        maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
        start: typeof args.start === "number" ? args.start : undefined,
      })
    case "crossref_resolve":
      return client.crossrefResolve(String(args.query ?? ""))
    default:
      throw new Error(`unknown scholar tool: ${name}`)
  }
}

// Minimal MCP stdio server (newline-delimited JSON-RPC): initialize, tools/list,
// tools/call. Spawned by OpenCode as `bun <scholar.ts> --mcp-stdio`.
export async function runScholarStdioServer(): Promise<void> {
  const userConfig = loadScholarUserConfig()
  const client = new ScholarClient({ s2ApiKey: userConfig.s2ApiKey, mailto: userConfig.mailto })
  let buffer = ""
  for await (const chunk of Bun.stdin.stream()) {
    buffer += new TextDecoder().decode(chunk)
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      let request: { id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
      try {
        request = JSON.parse(line) as typeof request
      } catch {
        continue
      }
      const id = request.id ?? null
      const respond = (result: unknown): void => {
        console.log(JSON.stringify({ jsonrpc: "2.0", id, result }))
      }
      const respondError = (code: number, message: string): void => {
        console.log(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }))
      }
      try {
        if (request.method === "initialize") {
          respond({
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "scholar", version: "1.0.0" },
          })
        } else if (request.method === "tools/list") {
          respond({
            tools: SCHOLAR_TOOL_NAMES.map((name) => ({ name, inputSchema: SCHOLAR_TOOL_INPUT_SCHEMAS[name] })),
          })
        } else if (request.method === "tools/call") {
          const output = await dispatchTool(client, request.params?.name ?? "", request.params?.arguments ?? {})
          respond({ content: [{ type: "text", text: JSON.stringify(output) }] })
        } else if (typeof request.method !== "string" || !request.method.startsWith("notifications/")) {
          respondError(-32601, `method not found: ${request.method ?? "unknown"}`)
        }
      } catch (error) {
        respondError(-32603, error instanceof Error ? error.message : "scholar tool failed")
      }
    }
  }
}

if (import.meta.main && process.argv.includes("--mcp-stdio")) {
  await runScholarStdioServer()
}
