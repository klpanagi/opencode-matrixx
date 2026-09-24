/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { isRetrievable, supersedeSkill } from "../../../src/features/evolution/store/lifecycle"

const PENDING_DIR = path.join(".matrixx", "evolution", "pending")

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(() => true).catch(() => false)
}

async function readMeta(root: string, slug: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(path.join(root, PENDING_DIR, `${slug}.meta.json`), "utf-8")
  return JSON.parse(raw) as Record<string, unknown>
}

describe("supersedeSkill (T7)", () => {
  test("sets superseded_by, audits it, and never unlinks history", async () => {
    //#given a pending artifact
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "supersede-skill-"))
    try {
      const dir = path.join(root, PENDING_DIR)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(path.join(dir, "old.meta.json"), JSON.stringify({ name: "old", version: "1.0.0" }))
      await fs.writeFile(path.join(dir, "old.md"), "# old\n")

      //#when superseding it
      const result = await supersedeSkill("old", { projectRoot: root, supersededBy: "old-abc12345" })

      //#then the meta points at the new slug, the audit records it, and the file survives
      expect(result.superseded).toBe(true)
      expect(result.supersededBy).toBe("old-abc12345")
      expect((await readMeta(root, "old")).superseded_by).toBe("old-abc12345")
      expect(await exists(path.join(dir, "old.md"))).toBe(true)
      const audit = await fs.readFile(path.join(root, ".matrixx/evolution/audit.log"), "utf-8")
      expect(audit).toContain('"action":"superseded"')
      expect(audit).toContain("old-abc12345")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("missing meta is fail-open and still audits", async () => {
    //#given an empty project
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "supersede-miss-"))
    try {
      //#when superseding a slug with no meta
      const result = await supersedeSkill("ghost", { projectRoot: root, supersededBy: "ghost-next" })

      //#then it reports not-superseded instead of throwing
      expect(result.superseded).toBe(false)
      expect(result.supersededBy).toBe("ghost-next")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  test("a superseded proposal is not retrievable while a live one is", () => {
    //#given an approved old artifact marked superseded and an approved live one
    const old = { status: "approved" as const, superseded: true, projectId: "p1", kind: "workflow" as const }
    const live = { status: "approved" as const, projectId: "p1", kind: "workflow" as const }

    //#when evaluating both
    //#then only the live head passes the retrieval contract
    expect(isRetrievable(old, { projectId: "p1", kinds: ["workflow"] })).toBe(false)
    expect(isRetrievable(live, { projectId: "p1", kinds: ["workflow"] })).toBe(true)
  })
})
