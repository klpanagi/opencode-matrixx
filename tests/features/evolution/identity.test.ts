/// <reference types="bun-types" />
import { beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  clearProjectIdentityCache,
  dedupKey,
  normalizeTitle,
  resolveProjectIdentity,
  UNSCOPED_LEGACY,
  type GitRunner,
} from "../../../src/features/evolution/store/project-identity"
import type { DistilledKnowledge } from "../../../src/features/evolution/types"
import { EvolutionWriter } from "../../../src/features/evolution/writer"

const ID_RE = /^sha256:[0-9a-f]{64}$/
const PENDING_DIR = path.join(".matrixx", "evolution", "pending")

function knowledge(overrides: Partial<DistilledKnowledge> = {}): DistilledKnowledge {
  return {
    title: "default-title",
    summary: "summary",
    patterns: ["p"],
    pitfalls: [],
    prerequisites: [],
    confidence: 0.8,
    sourceSessionIDs: ["ses-1"],
    kind: "workflow",
    sourceTraceIDs: ["tr-1"],
    distilledAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function gitRunner(remote: string | null, toplevel: string | null = null): GitRunner {
  return (args) => {
    if (args[0] === "remote") return remote
    if (args[0] === "rev-parse") return toplevel
    return null
  }
}

async function readAllText(dir: string): Promise<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  let out = ""
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    out += entry.isDirectory() ? await readAllText(p) : await fs.readFile(p, "utf-8").catch(() => "")
  }
  return out
}

async function withTmpProject<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "identity-test-"))
  const origCwd = process.cwd()
  try {
    process.chdir(tmpDir)
    return await fn(tmpDir)
  } finally {
    process.chdir(origCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

//#given every test starts from a cold identity cache
beforeEach(() => {
  clearProjectIdentityCache()
})

describe("resolveProjectIdentity determinism (T5)", () => {
  test("same remote yields the same id across different roots", () => {
    //#given two roots sharing one origin remote
    const runner = gitRunner("https://github.com/acme/repo.git")

    //#when resolving each root
    const a = resolveProjectIdentity("/tmp/root-a", runner)
    const b = resolveProjectIdentity("/tmp/root-b", runner)

    //#then the id is identical, hashed, and remote stays in-memory
    expect(a.projectId).toBe(b.projectId)
    expect(a.projectId).toMatch(ID_RE)
    expect(a.projectId).not.toContain("github.com")
    expect(a.remote).toBe("https://github.com/acme/repo.git")
  })

  test("no remote hashes the repo root so subdirs match, stable across restarts", () => {
    //#given a remote-less repo whose subdirs report the same toplevel
    const runner = gitRunner(null, "/repo/root")
    const subA = resolveProjectIdentity("/repo/root/a", runner)
    const subB = resolveProjectIdentity("/repo/root/b", runner)

    //#when clearing the memo cache to simulate a restart and resolving again
    clearProjectIdentityCache()
    const restarted = resolveProjectIdentity("/repo/root/a", runner)

    //#then subdirs collapse to one id and restart is deterministic
    expect(subA.projectId).toBe(subB.projectId)
    expect(restarted.projectId).toBe(subA.projectId)
    expect(subA.remote).toBeUndefined()
    expect(subA.projectId).toMatch(ID_RE)
  })
})

describe("project identity cache (T5)", () => {
  test("second resolve for the same root spawns no git", () => {
    //#given a counting runner and a fresh root
    let calls = 0
    const runner: GitRunner = () => {
      calls += 1
      return null
    }
    resolveProjectIdentity("/tmp/cache-root", runner)
    const afterFirst = calls

    //#when resolving the same root again
    resolveProjectIdentity("/tmp/cache-root", runner)

    //#then no further git invocation happens
    expect(afterFirst).toBeGreaterThan(0)
    expect(calls).toBe(afterFirst)
  })

  test("a different root recomputes instead of reusing the memo", () => {
    //#given one warmed root
    let calls = 0
    const runner: GitRunner = () => {
      calls += 1
      return null
    }
    resolveProjectIdentity("/tmp/root-one", runner)
    const afterFirst = calls

    //#when resolving a different root
    resolveProjectIdentity("/tmp/root-two", runner)

    //#then git is invoked again for the new key
    expect(calls).toBeGreaterThan(afterFirst)
  })
})

describe("project identity PII (T5)", () => {
  test("raw remote URL never reaches persisted or logged artifacts", async () => {
    //#given a remote URL carrying a secret and a resolved identity
    const secretRemote = "https://user:supersecret@example.com/private/repo.git"
    const identity = resolveProjectIdentity("/tmp/pii-root", gitRunner(secretRemote))

    //#when staging knowledge scoped to that identity
    await withTmpProject(async (tmpDir) => {
      const writer = new EvolutionWriter({
        outputDir: ".matrixx/evolution/skills",
        globalSkills: false,
        allowToolGeneration: false,
        allowAgentGeneration: false,
      })
      await writer.stage(knowledge({ title: "pii-skill", projectId: identity.projectId }))

      //#then no artifact under the project contains the raw remote or its secret
      const produced = await readAllText(tmpDir)
      expect(produced).not.toContain(secretRemote)
      expect(produced).not.toContain("supersecret")
      expect(identity.projectId).not.toContain("supersecret")
    })
  })
})

describe("dedupKey (T5)", () => {
  test("normalizes title and separates projects", () => {
    //#given a scoped identity and titles that normalize identically
    const idA = { projectId: "proj-a", root: "/a" }
    const idB = { projectId: "proj-b", root: "/b" }

    //#when deriving keys for noisy vs clean titles
    const noisy = dedupKey(idA, knowledge({ title: "  Deploy   Pipeline!! ", kind: "workflow" }))
    const clean = dedupKey(idA, knowledge({ title: "deploy-pipeline", kind: "workflow" }))
    const otherProject = dedupKey(idB, knowledge({ title: "deploy-pipeline", kind: "workflow" }))

    //#then same project+kind+title collides, different project does not
    expect(normalizeTitle("  Deploy   Pipeline!! ")).toBe("deploy-pipeline")
    expect(noisy).toBe(clean)
    expect(otherProject).not.toBe(noisy)
  })
})

describe("writer scoped dedup (T5)", () => {
  test("same-project duplicate is suppressed without a second write", async () => {
    await withTmpProject(async () => {
      //#given a first staged proposal in a project
      const writer = new EvolutionWriter({
        outputDir: ".matrixx/evolution/skills",
        globalSkills: false,
        allowToolGeneration: false,
        allowAgentGeneration: false,
      })
      const first = await writer.stage(knowledge({ title: "Dedupe Me", projectId: "proj-1", kind: "workflow" }))
      const before = (await fs.readdir(PENDING_DIR)).sort()

      //#when re-staging the same title+kind in the same project
      const second = await writer.stage(knowledge({ title: "dedupe-me", projectId: "proj-1", kind: "workflow" }))

      //#then it resolves to the existing slug and adds no files
      expect(second.deduped).toBe(true)
      expect(second.slug).toBe(first.slug)
      expect((await fs.readdir(PENDING_DIR)).sort()).toEqual(before)
    })
  })

  test("cross-project same-title duplicates are both kept as distinct slugs", async () => {
    await withTmpProject(async () => {
      //#given the same title staged in two different projects
      const writer = new EvolutionWriter({
        outputDir: ".matrixx/evolution/skills",
        globalSkills: false,
        allowToolGeneration: false,
        allowAgentGeneration: false,
      })
      const a = await writer.stage(knowledge({ title: "shared title", projectId: "proj-a", kind: "workflow" }))
      const b = await writer.stage(knowledge({ title: "shared title", projectId: "proj-b", kind: "workflow" }))

      //#then both metas survive under distinct slugs
      expect(b.slug).not.toBe(a.slug)
      expect(b.slug.startsWith("shared-title-")).toBe(true)
      const metas = (await fs.readdir(PENDING_DIR)).filter((f) => f.endsWith(".meta.json"))
      expect(metas).toHaveLength(2)

      //#when the second project re-stages the same title
      const b2 = await writer.stage(knowledge({ title: "shared title", projectId: "proj-b", kind: "workflow" }))

      //#then its own scoped proposal is the dedup target
      expect(b2.deduped).toBe(true)
      expect(b2.slug).toBe(b.slug)
    })
  })

  test("legacy meta without projectId loads fail-open as unscoped", async () => {
    await withTmpProject(async () => {
      //#given a hand-written legacy meta predating projectId
      const writer = new EvolutionWriter({
        outputDir: ".matrixx/evolution/skills",
        globalSkills: false,
        allowToolGeneration: false,
        allowAgentGeneration: false,
      })
      await fs.mkdir(PENDING_DIR, { recursive: true })
      const legacy = {
        name: "legacy-title",
        version: "1.0.0",
        derived_from: [],
        created_at: "2026-01-01T00:00:00.000Z",
        confidence: 0.8,
      }
      await fs.writeFile(path.join(PENDING_DIR, "legacy-title.meta.json"), JSON.stringify(legacy))
      await fs.writeFile(path.join(PENDING_DIR, "legacy-title.md"), "# legacy\n")

      //#when staging an unscoped knowledge with the same title
      const result = await writer.stage(knowledge({ title: "legacy title", kind: "convention", projectId: undefined }))

      //#then it never throws and treats the legacy row as the unscoped duplicate
      expect(result.deduped).toBe(true)
      expect(result.slug).toBe("legacy-title")
      expect(UNSCOPED_LEGACY).toBe("unscoped-legacy")
    })
  })
})
