/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { readRetrievalRecords } from "../../../src/features/evolution/store/query"
import type { DistilledKnowledge } from "../../../src/features/evolution/types"
import { EvolutionWriter } from "../../../src/features/evolution/writer"
import {
  contentHashFor,
  findLiveHead,
  listPendingMetas,
  resolveHeadSlug,
} from "../../../src/features/evolution/writer-supersede"

const PENDING_DIR = path.join(".matrixx", "evolution", "pending")

function knowledge(overrides: Partial<DistilledKnowledge> = {}): DistilledKnowledge {
  return {
    title: "supersede-skill",
    summary: "summary",
    patterns: ["p"],
    pitfalls: [],
    prerequisites: [],
    confidence: 0.8,
    sourceSessionIDs: ["ses-1"],
    kind: "workflow",
    projectId: "proj-1",
    sourceTraceIDs: ["tr-1"],
    distilledAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeWriter(): EvolutionWriter {
  return new EvolutionWriter({
    outputDir: ".matrixx/evolution/skills",
    globalSkills: false,
    allowToolGeneration: false,
    allowAgentGeneration: false,
  })
}

async function readMeta(slug: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(PENDING_DIR, `${slug}.meta.json`), "utf-8")
  return JSON.parse(raw) as Record<string, unknown>
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(() => true).catch(() => false)
}

async function withTmpProject<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "supersede-test-"))
  const origCwd = process.cwd()
  try {
    process.chdir(tmpDir)
    return await fn(tmpDir)
  } finally {
    process.chdir(origCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

describe("writer re-distill supersede (T7)", () => {
  test("different content creates a new artifact and supersedes the old one", async () => {
    await withTmpProject(async () => {
      //#given a staged proposal
      const writer = makeWriter()
      const first = await writer.stage(knowledge({ title: "deploy-pipeline", summary: "old summary" }))

      //#when re-distilling the same key with different content
      const second = await writer.stage(knowledge({ title: "deploy-pipeline", summary: "new summary" }))

      //#then both persist and the old one points at the new live head
      expect(second.deduped).toBeUndefined()
      expect(second.slug).not.toBe(first.slug)
      expect(second.slug.startsWith("deploy-pipeline-")).toBe(true)
      expect((await readMeta(first.slug)).superseded_by).toBe(second.slug)
      expect((await readMeta(second.slug)).superseded_by).toBeUndefined()
      expect(await fs.readFile(path.join(PENDING_DIR, `${first.slug}.md`), "utf-8")).toContain("old summary")
    })
  })

  test("byte-identical re-distill is suppressed with no extra files", async () => {
    await withTmpProject(async () => {
      //#given a staged proposal
      const writer = makeWriter()
      const first = await writer.stage(knowledge({ title: "idempotent" }))
      const before = (await fs.readdir(PENDING_DIR)).sort()

      //#when re-staging the exact same knowledge
      const second = await writer.stage(knowledge({ title: "idempotent" }))

      //#then it resolves to the existing slug and writes nothing
      expect(second.deduped).toBe(true)
      expect(second.slug).toBe(first.slug)
      expect((await fs.readdir(PENDING_DIR)).sort()).toEqual(before)
    })
  })

  test("a supersede chain resolves to the live head", async () => {
    await withTmpProject(async () => {
      //#given three successive re-distills of the same key
      const writer = makeWriter()
      const v1 = await writer.stage(knowledge({ title: "chain", summary: "s1" }))
      const v2 = await writer.stage(knowledge({ title: "chain", summary: "s2" }))
      const v3 = await writer.stage(knowledge({ title: "chain", summary: "s3" }))

      //#when resolving the head from the chain
      const metas = listPendingMetas(PENDING_DIR)

      //#then the resolver walks superseded_by to the newest artifact
      expect(resolveHeadSlug(metas, v1.slug)).toBe(v3.slug)
      expect(findLiveHead(metas, { baseSlug: "chain", projectId: "proj-1", kind: "workflow" })?.name).toBe(v3.slug)
      expect((await readMeta(v1.slug)).superseded_by).toBe(v2.slug)
      expect((await readMeta(v2.slug)).superseded_by).toBe(v3.slug)
    })
  })

  test("a missing superseded_by means the artifact is live (fail-open)", async () => {
    await withTmpProject(async () => {
      //#given a single artifact with no supersede marker
      const writer = makeWriter()
      const only = await writer.stage(knowledge({ title: "live-one" }))

      //#when resolving the live head
      const metas = listPendingMetas(PENDING_DIR)
      const head = findLiveHead(metas, { baseSlug: "live-one", projectId: "proj-1", kind: "workflow" })

      //#then it is returned rather than silently dropped
      expect(head?.name).toBe(only.slug)
      expect(head?.superseded_by).toBeUndefined()
    })
  })

  test("superseded artifact is excluded from retrieval while the head surfaces", async () => {
    await withTmpProject(async (tmpDir) => {
      //#given a superseded old and its live head
      const writer = makeWriter()
      const v1 = await writer.stage(knowledge({ title: "retrievable", summary: "s1" }))
      const v2 = await writer.stage(knowledge({ title: "retrievable", summary: "s2" }))

      //#when enumerating retrieval candidates
      const records = readRetrievalRecords(tmpDir)

      //#then the old is flagged superseded and the head is not
      expect(records.find((r) => r.id === v1.slug)?.meta.superseded).toBe(true)
      expect(records.find((r) => r.id === v2.slug)?.meta.superseded).toBeUndefined()
    })
  })

  test("promotion follows the live head and leaves the old history intact", async () => {
    await withTmpProject(async (tmpDir) => {
      //#given an old artifact superseded by a newer one
      const writer = makeWriter()
      const v1 = await writer.stage(knowledge({ title: "promote-me", summary: "s1" }))
      const v2 = await writer.stage(knowledge({ title: "promote-me", summary: "s2" }))

      //#when promoting the stale slug
      const { promotedPath } = await writer.promote(v1.slug)
      const promoted = await fs.readFile(promotedPath, "utf-8")

      //#then the head's content is promoted and the old pending copy is untouched
      expect(promotedPath).toContain(v2.slug)
      expect(promoted).toContain("s2")
      expect(await exists(path.join(tmpDir, ".opencode/skills", v1.slug))).toBe(false)
      expect(await exists(path.join(PENDING_DIR, `${v1.slug}.md`))).toBe(true)
    })
  })
})

describe("supersede helpers (T7)", () => {
  test("content hash is stable for identical knowledge and differs on change", () => {
    //#given identical vs changed knowledge
    const base = knowledge({ title: "hash-me" })
    const same = knowledge({ title: "hash-me" })
    const changed = knowledge({ title: "hash-me", summary: "other" })

    //#when hashing
    //#then equal payloads agree and a changed body diverges
    expect(contentHashFor(base)).toBe(contentHashFor(same))
    expect(contentHashFor(base)).not.toBe(contentHashFor(changed))
  })
})
