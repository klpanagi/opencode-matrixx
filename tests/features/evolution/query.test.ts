/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import * as path from "node:path"
import type { RetrievalMeta, RetrievalScope } from "../../../src/features/evolution/store/lifecycle"
import {
  CONTEXT_TRUNCATION_MARKER,
  type RetrievalRecord,
  readRetrievalRecords,
  searchRecords,
  truncateContext,
} from "../../../src/features/evolution/store/query"

let root: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "evolution-query-"))
})

afterEach(() => {
  if (existsSync(root)) rmSync(root, { recursive: true, force: true })
})

function writeSkillMeta(slug: string, meta: Record<string, unknown>, body = `# ${slug}\n`): void {
  const dir = path.join(root, ".matrixx", "evolution", "skills", slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta))
  writeFileSync(path.join(dir, "SKILL.md"), body)
}

function writePendingMeta(slug: string, meta: Record<string, unknown>): void {
  const dir = path.join(root, ".matrixx", "evolution", "pending")
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, `${slug}.meta.json`), JSON.stringify(meta))
}

const approved = (projectId: string, kind: string): Record<string, unknown> => ({
  name: "x",
  status: "approved",
  kind,
  projectId,
})

describe("readRetrievalRecords", () => {
  test("reads staged and pending metas with sibling SKILL.md text", () => {
    //#given a staged meta+body and a pending meta
    writeSkillMeta("head", approved("proj-1", "gotcha"), "# head\nbody text\n")
    writePendingMeta("draft", { name: "draft", status: "pending" })

    //#when reading retrieval records
    const records = readRetrievalRecords(root)

    //#then both metas are found and the staged body is attached
    const head = records.find((r) => r.id === "head")
    expect(head?.meta.status).toBe("approved")
    expect(head?.meta.kind).toBe("gotcha")
    expect(head?.text).toContain("body text")
    expect(records.some((r) => r.id === "draft")).toBe(true)
  })

  test("skips malformed metas and returns empty for a missing store", () => {
    //#given a malformed meta and an absent store elsewhere
    const dir = path.join(root, ".matrixx", "evolution", "skills", "broken")
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, "meta.json"), "{ not json")

    //#when reading
    const records = readRetrievalRecords(root)

    //#then malformed entries are dropped and no throw occurs
    expect(records).toEqual([])
    expect(readRetrievalRecords(path.join(root, "nowhere"))).toEqual([])
  })

  test("normalizes superseded_by and quarantine status into the retrieval flags", () => {
    //#given a superseded meta and a quarantined meta
    writeSkillMeta("old", { ...approved("proj-1", "gotcha"), superseded_by: "head" })
    writeSkillMeta("q1", { status: "quarantined", projectId: "proj-1", kind: "gotcha" })

    //#when reading
    const records = readRetrievalRecords(root)

    //#then the flags are surfaced to the filter contract
    expect(records.find((r) => r.id === "old")?.meta.superseded).toBe(true)
    expect(records.find((r) => r.id === "q1")?.meta.quarantined).toBe(true)
  })
})

describe("searchRecords", () => {
  const record = (id: string, meta: Partial<RetrievalMeta>, text = ""): RetrievalRecord => ({
    id,
    meta: { status: "approved", ...meta },
    text,
  })

  test("seeded mix: scoped gotcha returns the approved head only", () => {
    //#given a head v2, a superseded v1, a quarantined q1, another-project p1, and an unscoped u1
    const records: RetrievalRecord[] = [
      record("head-v2", { projectId: "proj-1", kind: "gotcha" }),
      record("superseded-v1", { projectId: "proj-1", kind: "gotcha", superseded: true }),
      record("q1", { projectId: "proj-1", kind: "gotcha", quarantined: true }),
      record("p1", { projectId: "proj-2", kind: "gotcha" }),
      record("u1", { kind: "gotcha" }),
    ]
    const scope: RetrievalScope = { projectId: "proj-1", kinds: ["gotcha"] }

    //#when searching within the scope
    const hits = searchRecords(records, { scope })

    //#then only the approved head for this project surfaces
    expect(hits.map((r) => r.id)).toEqual(["head-v2"])
  })

  test("text match narrows by case-insensitive substring", () => {
    //#given two approved records with different bodies
    const records = [
      record("a", { projectId: "proj-1", kind: "gotcha" }, "always pin the lockfile"),
      record("b", { projectId: "proj-1", kind: "gotcha" }, "prefer immutable state"),
    ]

    //#when searching for a term present in one body
    const hits = searchRecords(records, { query: "LOCKFILE", scope: { projectId: "proj-1" } })

    //#then only the matching record surfaces
    expect(hits.map((r) => r.id)).toEqual(["a"])
  })

  test("empty store returns an empty result without throwing", () => {
    //#given no records
    //#when searching
    const hits = searchRecords([], { query: "anything", scope: { projectId: "proj-1" } })

    //#then the result is empty
    expect(hits).toEqual([])
  })
})

describe("truncateContext", () => {
  test("returns text unchanged when within the cap", () => {
    //#given short text
    const text = "short context"

    //#when truncating with a generous cap
    const result = truncateContext(text, 100)

    //#then it is untouched
    expect(result).toBe(text)
  })

  test("cuts at the cap and appends a truncation marker", () => {
    //#given text longer than the cap
    const text = "a".repeat(50)

    //#when truncating
    const result = truncateContext(text, 10)

    //#then the body is capped and the marker is appended
    expect(result.startsWith("a".repeat(10))).toBe(true)
    expect(result).toContain(CONTEXT_TRUNCATION_MARKER)
  })
})
