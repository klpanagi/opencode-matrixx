/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { hasProvenance } from "../../../src/features/evolution/writer-frontmatter"
import type { DistilledKnowledge } from "../../../src/features/evolution/types"
import { EvolutionWriter } from "../../../src/features/evolution/writer"
import { passesQualityGate } from "../../../src/hooks/evolution-quality-gate"

const PENDING_DIR = path.join(".matrixx", "evolution", "pending")
const SECRET = "sk-abcdefghijklmnopqrstuvwxyz123456"

function knowledge(overrides: Partial<DistilledKnowledge> = {}): DistilledKnowledge {
  return {
    title: "secret-skill",
    summary: "a reusable summary",
    patterns: ["pattern-one"],
    pitfalls: [],
    prerequisites: [],
    confidence: 0.8,
    sourceSessionIDs: ["ses-a"],
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

function governance() {
  return { requireApproval: true, autoPromote: false, autoPromoteThreshold: 0.85, minConfidence: 0.7 }
}

async function withTmpProject<T>(fn: () => Promise<T>): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "provenance-secret-"))
  const origCwd = process.cwd()
  try {
    process.chdir(tmpDir)
    return await fn()
  } finally {
    process.chdir(origCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

describe("secret handling on the provenance path (T8)", () => {
  test("a secret-trace-derived draft is still gate-rejected", () => {
    //#given a distilled draft whose summary embeds a secret
    const draft = knowledge({ summary: `leaked ${SECRET}` })

    //#when running the existing quality gate
    const gate = passesQualityGate(draft, governance())

    //#then the gate blocks it and names the secret reason
    expect(gate.pass).toBe(false)
    expect(gate.reason).toBe("potential secret detected")
  })

  test("writer refuses to persist secret-bearing content (containsSecret honored)", async () => {
    await withTmpProject(async () => {
      //#given secret-bearing knowledge reaching the writer directly
      const dirty = knowledge({ summary: `leaked ${SECRET}` })

      //#when staging it
      //#then the writer stops the write instead of emitting a secret
      await expect(makeWriter().stage(dirty)).rejects.toThrow(/secret/)
      await expect(fs.readdir(PENDING_DIR).catch(() => [])).resolves.not.toContain("secret-skill.md")
    })
  })
})

describe("legacy provenance load fail-open (T8)", () => {
  test("legacy meta without provenance is flagged, loads, and never throws", async () => {
    await withTmpProject(async () => {
      //#given a hand-written legacy meta predating provenance
      const writer = makeWriter()
      await fs.mkdir(PENDING_DIR, { recursive: true })
      const legacy = {
        name: "legacy-prov",
        version: "1.0.0",
        derived_from: ["ses-old"],
        created_at: "2026-01-01T00:00:00.000Z",
        confidence: 0.8,
      }
      await fs.writeFile(path.join(PENDING_DIR, "legacy-prov.meta.json"), JSON.stringify(legacy))
      await fs.writeFile(path.join(PENDING_DIR, "legacy-prov.md"), "# legacy\n")
      expect(hasProvenance(legacy)).toBe(false)

      //#when staging an unscoped knowledge with the same title
      const result = await writer.stage(
        knowledge({ title: "legacy prov", kind: "convention", projectId: undefined, sourceTraceIDs: [], distilledAt: "" }),
      )

      //#then it fail-opens, warns, and treats the legacy row as the duplicate
      expect(result.deduped).toBe(true)
      expect(result.slug).toBe("legacy-prov")
    })
  })
})
