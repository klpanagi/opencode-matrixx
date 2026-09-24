/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { load } from "js-yaml"
import { containsSecretForEval } from "../../../src/features/evolution/evaluator"
import { traceStore } from "../../../src/features/evolution/store"
import type { DistilledKnowledge, TraceRecord } from "../../../src/features/evolution/types"
import { EvolutionWriter } from "../../../src/features/evolution/writer"
import { hasProvenance } from "../../../src/features/evolution/writer-frontmatter"

const ISO = "2026-01-01T00:00:00.000Z"
const PENDING_DIR = path.join(".matrixx", "evolution", "pending")
const TRACES_DIR = path.join(".matrixx", "evolution", "traces")

function knowledge(overrides: Partial<DistilledKnowledge> = {}): DistilledKnowledge {
  return {
    title: "provenance-skill",
    summary: "a reusable summary",
    patterns: ["pattern-one"],
    pitfalls: [],
    prerequisites: [],
    confidence: 0.8,
    sourceSessionIDs: ["ses-a"],
    kind: "gotcha",
    projectId: "proj-1",
    sourceTraceIDs: ["tr-1", "tr-2"],
    distilledAt: ISO,
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

function makeTrace(id: string, sessionID: string): TraceRecord {
  return {
    id,
    sessionID,
    callID: `call-${id}`,
    timestamp: ISO,
    agent: "test-agent",
    tool: "read",
    args: {},
    output: `out-${id}`,
    durationMs: 5,
    success: true,
  }
}

async function withTmpProject<T>(fn: () => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "provenance-test-"))
  const origCwd = process.cwd()
  try {
    process.chdir(tmpDir)
    return await fn()
  } finally {
    process.chdir(origCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

function extractFrontmatter(content: string): string {
  const start = content.indexOf("---\n")
  const end = content.indexOf("\n---", start + 4)
  return content.slice(start + 4, end)
}

async function readPendingFrontmatter(slug: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(PENDING_DIR, `${slug}.md`), "utf-8")
  return load(extractFrontmatter(raw)) as Record<string, unknown>
}

//#given each test resolves the shared singleton against a fresh cwd
beforeEach(() => {
  process.env.MATRIXX_PROVENANCE_TEST = "1"
})

describe("emitted provenance frontmatter (T8)", () => {
  test("YAML-parses and carries every evidence field", async () => {
    await withTmpProject(async () => {
      //#given a knowledge record with full provenance
      const { slug } = await makeWriter().stage(knowledge())

      //#when reading the staged SKILL.md frontmatter
      const fm = await readPendingFrontmatter(slug)

      //#then every provenance key survives YAML parsing with its value
      expect(fm.name).toBe(slug)
      expect(fm.version).toBe("1.0.0")
      expect(fm.derived_from).toEqual(["ses-a"])
      expect(fm.session_ids).toEqual(["ses-a"])
      expect(fm.trace_ids).toEqual(["tr-1", "tr-2"])
      expect(fm.project_id).toBe("proj-1")
      expect(fm.kind).toBe("gotcha")
      expect(fm.confidence).toBe(0.8)
      expect(fm.distilled_at).toBe(ISO)
    })
  })

  test("emitted frontmatter passes the reused secret scan", async () => {
    await withTmpProject(async () => {
      //#given a clean staged skill
      const { slug } = await makeWriter().stage(knowledge({ title: "clean-skill" }))
      const raw = await fs.readFile(path.join(PENDING_DIR, `${slug}.md`), "utf-8")

      //#when scanning the emitted content with the existing utility
      const found = containsSecretForEval(raw)

      //#then no secret pattern fires
      expect(found).toBe(false)
    })
  })

  test("meta.json mirrors the frontmatter provenance", async () => {
    await withTmpProject(async () => {
      //#given a staged proposal
      const { slug, metaPath } = await makeWriter().stage(knowledge())

      //#when reading both artifacts
      const fm = await readPendingFrontmatter(slug)
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as Record<string, unknown>

      //#then meta mirrors each provenance value from the frontmatter
      expect(meta.session_ids).toEqual(fm.session_ids)
      expect(meta.trace_ids).toEqual(fm.trace_ids)
      expect(meta.projectId).toBe(fm.project_id)
      expect(meta.kind).toBe(fm.kind)
      expect(meta.confidence).toBe(fm.confidence)
      expect(meta.distilled_at).toBe(fm.distilled_at)
      expect(hasProvenance(meta)).toBe(true)
    })
  })
})

describe("trace_ids round-trip (T8)", () => {
  test("every emitted trace id resolves to a row in traces/<session>.jsonl", async () => {
    await withTmpProject(async () => {
      //#given trace rows appended by the watcher store
      await traceStore.append(makeTrace("tr-a", "ses-rt"))
      await traceStore.append(makeTrace("tr-b", "ses-rt"))

      //#when staging knowledge citing those traces
      const { slug } = await makeWriter().stage(
        knowledge({ title: "round-trip", sourceSessionIDs: ["ses-rt"], sourceTraceIDs: ["tr-a", "tr-b"] }),
      )
      const fm = await readPendingFrontmatter(slug)

      //#then each emitted trace id exists in the session trace file
      const file = await fs.readFile(path.join(TRACES_DIR, "ses-rt.jsonl"), "utf-8")
      const rows = file
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TraceRecord)
      for (const id of fm.trace_ids as string[]) {
        expect(rows.some((row) => row.id === id)).toBe(true)
      }
    })
  })
})
