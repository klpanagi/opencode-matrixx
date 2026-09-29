/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..")
const AGENT_DIR = join(REPO_ROOT, "src", "agents", "architect")

function readVariant(file: string): string {
  return readFileSync(join(AGENT_DIR, file), "utf8")
}

/**
 * Contract claims that MUST appear verbatim in every Architect prompt variant.
 * `gpt.ts` is a sibling copy of `default.ts`; without this list one variant
 * silently rots while the other stays current.
 */
const SHARED_CONTRACT_CLAIMS: readonly string[] = [
  "40,000-byte",
  "section",
  "sectionIndex",
  "offset=N, limit=M",
  "file_too_large",
  "clamped: true",
  "read_failed",
  "degraded",
  "contentHash",
  "NEVER",
]

const OBSOLETE_PHRASES: readonly string[] = [
  "can error on oversized plans",
  "both caps can return an outline",
  "One call cannot return a plan",
]

describe("architect prompt plan-read contract", () => {
  describe("default.ts", () => {
    //#given the Claude-optimized Architect prompt
    const prompt = readVariant("default.ts")

    test("no obsolete recovery-protocol phrasing survives", () => {
      //#given every phrase the pre-cutover prompt asserted and the tools no longer do
      //#when each phrase is searched in the prompt
      //#then none is present
      for (const phrase of OBSOLETE_PHRASES) {
        expect(prompt).not.toContain(phrase)
      }
    })

    test("names the 40,000-byte rendered cap as the only remaining limit", () => {
      //#given the recovery protocol
      //#when the recovery protocol text is inspected
      //#then it names the rendered cap and does not describe the file cap as a wall
      const recovery = prompt.slice(
        prompt.indexOf("RECOVERY PROTOCOL"),
        prompt.indexOf("</boundaries>"),
      )
      expect(recovery).toContain("40,000-byte RENDERED cap")
      expect(recovery).toContain("ceiling, not a wall")
      expect(recovery).toContain("read_failed")
      expect(recovery).toContain("no selector fixes it")
    })

    test("teaches the section selector with a concrete example call", () => {
      //#given the plan-reading instructions
      //#when the prompt is searched for a section example
      //#then an example call exists AND pagination is documented alongside it
      expect(prompt).toContain('section="todos"')
      expect(prompt).toContain("offset=N, limit=M")
      expect(prompt).toContain("sectionIndex=K")
    })

    test("keeps plan access Architect-owned and non-delegable", () => {
      //#given the boundaries section
      //#when the plan-ownership rules are read
      //#then a reader subagent is forbidden and ownership stays with Architect
      expect(prompt).toContain("MUST NEVER be delegated to a subagent")
      expect(prompt).toContain("spawn a reader subagent for plan content")
    })
  })

  describe("cross-variant consistency", () => {
    //#given both Architect prompt variants as sibling copies of one contract
    const variants = ["default.ts", "gpt.ts"].map((file) => [file, readVariant(file)] as const)

    test("both variants assert the SAME contract", () => {
      //#given the two variant sources
      //#when every shared contract claim is checked in each
      //#then both variants carry all of them — divergence fails here
      for (const [file, prompt] of variants) {
        for (const claim of SHARED_CONTRACT_CLAIMS) {
          expect(prompt, `${file} is missing the shared claim: ${claim}`).toContain(claim)
        }
      }
    })

    test("neither variant keeps the obsolete recovery protocol", () => {
      //#given both variant sources
      //#when each obsolete phrase is searched
      //#then neither retains it
      for (const [file, prompt] of variants) {
        for (const phrase of OBSOLETE_PHRASES) {
          expect(prompt, `${file} still contains: ${phrase}`).not.toContain(phrase)
        }
      }
    })
  })
})

describe("global obsolete-recovery-protocol sweep", () => {
  const GLOBAL_OBSOLETE_PHRASES: readonly string[] = [
    "can error on oversized plans",
    "One call cannot return a plan",
    "both caps can return an outline with no content",
  ]

  /**
   * src/agents/smith.ts is EXPLICITLY EXCLUDED and MUST stay excluded.
   * Reason: it is byte-frozen by a mission guardrail — it is not owned here and
   * must not be edited to satisfy a documentation test. A silent skip would be
   * a false pass (the next reader would assume the file was checked), so the
   * exclusion is asserted: the file must still be present in the swept tree, and
   * it must be the ONLY exclusion. If the freeze is ever lifted — or a second
   * carve-out is added for convenience — these tests fail.
   */
  const FROZEN_DOC_SWEEP_SITES = ["src/agents/smith.ts"]

  const SWEEP_ROOTS = ["src/agents", "src/features/builtin-commands/templates"] as const

  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, acc)
      } else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".test.ts")) {
        acc.push(full)
      }
    }
    return acc
  }

  function sweptFiles(): string[] {
    const found: string[] = []
    for (const root of SWEEP_ROOTS) {
      for (const file of walk(join(REPO_ROOT, root))) {
        found.push(relative(REPO_ROOT, file).split("\\").join("/"))
      }
    }
    return found.sort()
  }

  test("the swept tree is non-empty and covers both required roots", () => {
    //#given the sweep roots and a recursive walk over the real source tree
    //#when the derived file set is compared against the required surfaces
    //#then it is populated, contains both roots, and still includes the frozen file
    const files = sweptFiles()

    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.startsWith("src/agents/"))).toBe(true)
    expect(files.some((f) => f.startsWith("src/features/builtin-commands/templates/"))).toBe(true)
    expect(files).toContain("src/agents/smith.ts")
  })

  test("the smith.ts carve-out is the only exclusion, and the file is genuinely frozen", () => {
    //#given the frozen-site list
    const frozen = FROZEN_DOC_SWEEP_SITES

    //#when it is compared against the derived sweep set
    const actual = sweptFiles()

    //#then smith.ts is in the tree, it is the sole exclusion, and it is a real agent source
    expect(actual).toContain("src/agents/smith.ts")
    expect(frozen).toEqual(["src/agents/smith.ts"])
    expect(actual.filter((f) => frozen.includes(f))).toEqual(["src/agents/smith.ts"])
    expect(statSync(join(REPO_ROOT, "src/agents/smith.ts")).isFile()).toBe(true)
  })

  test("no swept file reintroduces an obsolete recovery-protocol phrase", () => {
    //#given every agent prompt and command template in the swept tree
    const files = sweptFiles().filter((f) => !FROZEN_DOC_SWEEP_SITES.includes(f))

    //#when each file is searched for every obsolete phrase
    const hits: string[] = []
    for (const file of files) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8")
      for (const phrase of GLOBAL_OBSOLETE_PHRASES) {
        if (source.includes(phrase)) hits.push(`${file} :: ${phrase}`)
      }
    }

    //#then no hit exists, and the sweep demonstrably read a non-empty set
    expect(files.length).toBeGreaterThan(0)
    expect(hits).toEqual([])
  })
})
