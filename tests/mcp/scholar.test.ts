/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createBuiltinMcps } from "../../src/mcp/index"
import {
  ScholarClient,
  TokenBucketRateLimiter,
  arxivRateLimiter,
  toScholarDossier,
  type ScholarFetch,
} from "../../src/mcp/scholar"
import { validateScholarConfig } from "../../src/mcp/mcp-validator"

// MINIMAL suite for Task 8 gates. Owned long-term by Task 10, which will
// extend/harden it (live-server spawn, dossier fixture, more backends).
// No mock.module() used — pure fetch injection, so no mock-heavy bookkeeping.

function fastLimiter(): TokenBucketRateLimiter {
  return new TokenBucketRateLimiter(1000, 1000)
}

function jsonFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }): ScholarFetch {
  return async (input: string, init?: RequestInit) => {
    const { status, body } = handler(input, init)
    return new Response(JSON.stringify(body), { status })
  }
}

function s2Paper(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paperId: "s2id-1",
    title: "Attention Is All You Need",
    abstract: "Transformer networks.",
    authors: [{ name: "Vaswani" }],
    year: 2017,
    url: "https://example.com/paper",
    externalIds: { DOI: "10.1234/abc" },
    citationCount: 100000,
    tldr: { text: "Transformers for sequence modeling." },
    ...overrides,
  }
}

describe("scholar token-bucket limiter", () => {
  test("second acquire waits for a refill (spacing enforced)", async () => {
    //#given
    let now = 0
    const slept: number[] = []
    const limiter = new TokenBucketRateLimiter(1, 1, () => now, async (ms) => {
      slept.push(ms)
      now += ms
    })

    //#when
    await limiter.acquire()
    await limiter.acquire()

    //#then
    expect(slept).toHaveLength(1)
    expect(slept[0]).toBeGreaterThanOrEqual(1000)
  })

  test("arxiv limiter keeps verbatim 1/3 RPS burst 1 params", () => {
    //#given
    const shared = arxivRateLimiter

    //#when
    const rate = shared.rate
    const burst = shared.burstSize

    //#then
    expect(rate).toBeCloseTo(1 / 3, 10)
    expect(burst).toBe(1)
  })
})

describe("scholar S2 key passthrough", () => {
  test("sends x-api-key header when key is configured", async () => {
    //#given
    const seen: Array<Record<string, string>> = []
    const fetchFn = jsonFetch((_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return { status: 200, body: { data: [] } }
    })
    const client = new ScholarClient({ s2ApiKey: "test-key-value", fetchFn, s2Limiter: fastLimiter() })

    //#when
    await client.s2Search("transformers")

    //#then
    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveProperty("x-api-key", "test-key-value")
  })

  test("sends no key header when anonymous", async () => {
    //#given
    const seen: Array<Record<string, string>> = []
    const fetchFn = jsonFetch((_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return { status: 200, body: { data: [] } }
    })
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    await client.s2Search("transformers")

    //#then
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toHaveProperty("x-api-key")
  })

  test("retries 429 with backoff then returns papers", async () => {
    //#given
    let calls = 0
    const waits: number[] = []
    const fetchFn = jsonFetch(() => {
      calls += 1
      if (calls === 1) return { status: 429, body: {} }
      return { status: 200, body: { data: [s2Paper()] } }
    })
    const client = new ScholarClient({
      fetchFn,
      sleep: async (ms) => {
        waits.push(ms)
      },
      s2Limiter: fastLimiter(),
    })

    //#when
    const papers = await client.s2Search("transformers")

    //#then
    expect(calls).toBe(2)
    expect(waits).toEqual([1000])
    expect(papers).toHaveLength(1)
    expect(papers[0]?.title).toBe("Attention Is All You Need")
    expect(papers[0]?.citationCount).toBe(100000)
  })
})

describe("scholar OpenAlex mailto", () => {
  test("sends mailto User-Agent header when mailto is configured", async () => {
    //#given
    const seen: Array<Record<string, string>> = []
    const fetchFn = jsonFetch((_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return { status: 200, body: { results: [] } }
    })
    const client = new ScholarClient({ mailto: "reviewer@example.org", fetchFn, s2Limiter: fastLimiter() })

    //#when
    await client.openAlexSearch("transformers")

    //#then
    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveProperty("User-Agent", "mailto:reviewer@example.org")
  })

  test("reconstructs abstract from inverted index and parses DOI", async () => {
    //#given
    const fetchFn = jsonFetch(() => ({
      status: 200,
      body: {
        results: [
          {
            id: "https://openalex.org/W1",
            title: "Open Paper",
            abstract_inverted_index: { Hello: [0], world: [1] },
            authorships: [{ author: { display_name: "Curie" } }],
            publication_year: 2020,
            doi: "https://doi.org/10.5678/xyz",
            cited_by_count: 42,
          },
        ],
      },
    }))
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    const [paper] = await client.openAlexSearch("open")

    //#then
    expect(paper?.abstract).toBe("Hello world")
    expect(paper?.doi).toBe("10.5678/xyz")
    expect(paper?.year).toBe(2020)
    expect(paper?.citationCount).toBe(42)
    expect(toScholarDossier([paper!])).toEqual([
      {
        title: "Open Paper",
        year: 2020,
        citationCount: 42,
        doi: "10.5678/xyz",
        url: "https://doi.org/10.5678/xyz",
        source: "openalex",
        authors: ["Curie"],
      },
    ])
  })
})

describe("scholar federated search and crossref", () => {
  test("scholar_search merges S2 and OpenAlex, dedupes by DOI, sorts cited-first", async () => {
    //#given
    const fetchFn = jsonFetch((url) => {
      if (url.includes("semanticscholar")) {
        return {
          status: 200,
          body: {
            data: [s2Paper({ paperId: "dup", citationCount: 50, externalIds: { DOI: "10.1/dup" } })],
          },
        }
      }
      return {
        status: 200,
        body: {
          results: [
            {
              id: "https://openalex.org/Wdup",
              title: "Dup Paper",
              authorships: [],
              publication_year: 2021,
              doi: "https://doi.org/10.1/dup",
              cited_by_count: 60,
            },
            {
              id: "https://openalex.org/W2",
              title: "Top Cited",
              authorships: [],
              publication_year: 2019,
              doi: "https://doi.org/10.1/top",
              cited_by_count: 500,
            },
          ],
        },
      }
    })
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    const papers = await client.scholarSearch("dup", { limit: 10 })

    //#then
    expect(papers).toHaveLength(2)
    expect(papers[0]?.doi).toBe("10.1/top")
    expect(papers[1]?.doi).toBe("10.1/dup")
  })

  test("crossref_resolve fetches a DOI directly and searches otherwise", async () => {
    //#given
    const seen: string[] = []
    const fetchFn = jsonFetch((url) => {
      seen.push(url)
      if (url.includes("/works/10.1234%2Fabc")) {
        return {
          status: 200,
          body: {
            message: {
              DOI: "10.1234/abc",
              title: ["Resolved Paper"],
              author: [{ given: "Ada", family: "Lovelace" }],
              URL: "https://doi.org/10.1234/abc",
              "published-print": { "date-parts": [[1843]] },
              "is-referenced-by-count": 7,
            },
          },
        }
      }
      return { status: 200, body: { message: { items: [] } } }
    })
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    const paper = await client.crossrefResolve("10.1234/abc")

    //#then
    expect(paper?.title).toBe("Resolved Paper")
    expect(paper?.year).toBe(1843)
    expect(paper?.citationCount).toBe(7)
    expect(seen.some((u) => u.includes("/works/"))).toBe(true)
  })
})

describe("scholar validator redaction", () => {
  test("error messages never echo configured values", () => {
    //#given
    const bad = { s2ApiKey: "", mailto: "not-an-email" }

    //#when
    const result = validateScholarConfig(bad)

    //#then
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toContain("not-an-email")
    }
    expect(validateScholarConfig({ s2ApiKey: "present", mailto: "a@b.co" })).toEqual({ ok: true })
    expect(validateScholarConfig(undefined)).toEqual({ ok: true })
  })
})

describe("scholar MCP registration", () => {
  test("registers disabled stub without scholar config, enabled local MCP with config", () => {
    //#given
    const without = createBuiltinMcps([], undefined, { isCommandAvailable: () => true })
    const withConfig = createBuiltinMcps([], { scholar: { mailto: "a@b.co" } }, { isCommandAvailable: () => true })

    //#when
    const stub = without.mcps.scholar as { enabled: boolean }
    const active = withConfig.mcps.scholar as { enabled: boolean; command: string[] }

    //#then
    expect(stub.enabled).toBe(false)
    expect(active.enabled).toBe(true)
    expect(active.command[0]).toBe("bun")
    expect(without.failures).toHaveLength(0)
  })
})

describe("scholar Task 10 verification suite", () => {
  test("arxiv acquires limiter once per call (spacing enforced)", async () => {
    //#given
    let acquires = 0
    const counting = { acquire: async () => {
      acquires += 1
    },
    } as unknown as TokenBucketRateLimiter
    const fetchFn = jsonFetch(() => ({ status: 200, body: "<feed></feed>" }))
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter(), arxivLimiter: counting })

    //#when
    await client.arxivSearch("transformers", { maxResults: 1 })
    await client.arxivSearch("transformers", { maxResults: 1 })

    //#then
    expect(acquires).toBe(2)
  })

  test("keyed S2 skips limiter; anonymous S2 acquires limiter", async () => {
    //#given
    let keyedAcquires = 0
    let anonAcquires = 0
    const keyedLimiter = { acquire: async () => {
      keyedAcquires += 1
    },
    } as unknown as TokenBucketRateLimiter
    const anonLimiter = { acquire: async () => {
      anonAcquires += 1
    },
    } as unknown as TokenBucketRateLimiter
    const okFetch = jsonFetch(() => ({ status: 200, body: { data: [] } }))
    const keyed = new ScholarClient({ s2ApiKey: "s2-test-key", fetchFn: okFetch, s2Limiter: keyedLimiter })
    const anon = new ScholarClient({ fetchFn: okFetch, s2Limiter: anonLimiter })

    //#when
    await keyed.s2Search("transformers")
    await anon.s2Search("transformers")

    //#then
    expect(keyedAcquires).toBe(0)
    expect(anonAcquires).toBe(1)
  })

  test("S2 double-429 retries with exponential backoff then succeeds", async () => {
    //#given
    let calls = 0
    const waits: number[] = []
    const fetchFn = jsonFetch(() => {
      calls += 1
      if (calls <= 2) return { status: 429, body: {} }
      return { status: 200, body: { data: [s2Paper()] } }
    })
    const client = new ScholarClient({
      fetchFn,
      sleep: async (ms) => {
        waits.push(ms)
      },
      s2Limiter: fastLimiter(),
    })

    //#when
    const papers = await client.s2Search("transformers")

    //#then
    expect(calls).toBe(3)
    expect(waits).toEqual([1000, 2000])
    expect(papers).toHaveLength(1)
  })

  test("OpenAlex sends no User-Agent header when anonymous", async () => {
    //#given
    const seen: Array<Record<string, string>> = []
    const fetchFn = jsonFetch((_url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) })
      return { status: 200, body: { results: [] } }
    })
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    await client.openAlexSearch("transformers")

    //#then
    expect(seen).toHaveLength(1)
    expect(seen[0]).not.toHaveProperty("User-Agent")
  })

  test("CrossRef fixture search maps title/year/citationCount", async () => {
    //#given
    const fetchFn = jsonFetch(() => ({
      status: 200,
      body: {
        message: {
          items: [
            {
              DOI: "10.1109/CVPR.2016.90",
              title: ["Deep Residual Learning for Image Recognition"],
              author: [{ given: "Kaiming", family: "He" }],
              URL: "https://doi.org/10.1109/CVPR.2016.90",
              "published-print": { "date-parts": [[2016]] },
              "is-referenced-by-count": 138204,
            },
          ],
        },
      },
    }))
    const client = new ScholarClient({ fetchFn, s2Limiter: fastLimiter() })

    //#when
    const [paper] = await client.crossrefSearch("residual learning")

    //#then
    expect(paper?.title).toBe("Deep Residual Learning for Image Recognition")
    expect(paper?.year).toBe(2016)
    expect(paper?.citationCount).toBe(138204)
  })

  test("error paths never leak key material", async () => {
    //#given
    const secret = "s2-live-secret-value-abc123"
    const failing: ScholarFetch = async () => new Response("boom", { status: 500 })
    const client = new ScholarClient({ s2ApiKey: secret, fetchFn: failing, s2Limiter: fastLimiter() })
    const bad = validateScholarConfig({ s2ApiKey: "", mailto: "not-an-email" })

    //#when
    const papers = await client.s2Search("transformers")
    const openAlex = await client.openAlexSearch("transformers")

    //#then
    expect(papers).toEqual([])
    expect(openAlex).toEqual([])
    expect(JSON.stringify(papers)).not.toContain(secret)
    expect(JSON.stringify(openAlex)).not.toContain(secret)
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error).not.toContain(secret)
      expect(bad.error).not.toContain("not-an-email")
    }
  })

  test("dossier fixture has >=5 papers with title/year/citationCount and matches toScholarDossier shape", async () => {
    //#given
    const file = Bun.file(new URL("../fixtures/scholar-dossier.json", import.meta.url))
    const dossier = (await file.json()) as { papers: Array<Record<string, unknown>> }

    //#when
    const papers = dossier.papers
    const shaped = toScholarDossier([
      {
        externalId: "s2id-1",
        source: "semantic_scholar",
        title: "Attention Is All You Need",
        abstract: "Transformer networks.",
        authors: ["Vaswani"],
        year: 2017,
        url: "https://example.com/paper",
        doi: "10.1234/abc",
        citationCount: 100000,
        tldr: null,
        paperId: "s2id-1",
      },
    ])

    //#then
    expect(papers.length).toBeGreaterThanOrEqual(5)
    for (const paper of papers) {
      expect(typeof paper.title).toBe("string")
      expect(paper.title).not.toBe("")
      expect(typeof paper.year).toBe("number")
      expect(typeof paper.citationCount).toBe("number")
    }
    expect(Object.keys(shaped[0] ?? {}).sort()).toEqual(
      Object.keys(papers[0] ?? {}).sort(),
    )
  })
})
