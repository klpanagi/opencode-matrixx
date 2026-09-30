/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  MIN_SIGNIFICANT_SAMPLE,
  readCalibrationCorpus,
} from "../../../src/features/completion-review/calibration-corpus"
import { SIGNIFICANCE_NOTE_PREFIX } from "../../../src/features/completion-review/calibration-corpus-aggregate"
import { buildReviewDirCommand } from "../../../src/features/completion-review/report-write"
import { finding, sidecar } from "./calibration-corpus-fixtures"

let dir = ""
let reviewsDir = ""
let previousCwd = ""

/** The caller's job — `.matrixx/reviews/` is created with `ls`/mkdir, never from TS. */
function createReviewsDir(): void {
  const result = Bun.spawnSync(["sh", "-c", buildReviewDirCommand()])
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
}

function writeSidecar(plan: string, json: unknown): void {
  writeFileSync(join(reviewsDir, `${plan}.json`), `${JSON.stringify(json, null, 2)}\n`)
}

beforeEach(() => {
  previousCwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), "cr-corpus-"))
  process.chdir(dir)
  createReviewsDir()
  reviewsDir = join(dir, ".matrixx", "reviews")
})

afterEach(() => {
  process.chdir(previousCwd)
  rmSync(dir, { recursive: true, force: true })
})

describe("readCalibrationCorpus — sample honesty", () => {
  test("reports sampleCount 3 for three sidecars and calls the sample not significant", () => {
    //#given three synthetic reviews written through T4's real sidecar type
    for (const plan of ["alpha", "beta", "gamma"]) writeSidecar(plan, sidecar({ plan }))

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then three data points are reported as three, and explicitly not as a trend
    expect(corpus.sampleCount).toBe(3)
    expect(corpus.significant).toBe(false)
    expect(corpus.significanceNote).toContain(SIGNIFICANCE_NOTE_PREFIX)
    expect(corpus.significanceNote).toContain("3 samples")
    expect(corpus.significanceNote).toContain(String(MIN_SIGNIFICANT_SAMPLE))
  })

  test("marks the corpus significant only at or above the threshold", () => {
    //#given exactly the threshold number of readable sidecars
    for (let i = 0; i < MIN_SIGNIFICANT_SAMPLE; i += 1) writeSidecar(`plan-${i}`, sidecar({ plan: `plan-${i}` }))

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the sample crosses the threshold and no longer disclaims itself
    expect(corpus.sampleCount).toBe(MIN_SIGNIFICANT_SAMPLE)
    expect(corpus.significant).toBe(true)
    expect(corpus.significanceNote).not.toContain(SIGNIFICANCE_NOTE_PREFIX)
  })

  test("an empty reviews directory is an empty corpus, not a throw", () => {
    //#given a reviews directory with no reviews in it
    expect(readdirSync(reviewsDir)).toEqual([])

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the corpus is empty and says so in words
    expect(corpus.sampleCount).toBe(0)
    expect(corpus.significanceNote).toContain("no reviews have been recorded yet")
  })

  test("a missing reviews directory is an empty corpus, not a throw", () => {
    //#given a directory that was never created
    const absent = join(dir, "nope")

    //#when the corpus is read
    const corpus = readCalibrationCorpus(absent)

    //#then the caller gets a report it can render before the first review
    expect(corpus.sampleCount).toBe(0)
    expect(corpus.skipped).toEqual([])
  })
})

describe("readCalibrationCorpus — sidecar preferred, markdown only a fallback", () => {
  test("reads the .json sidecar and never parses the sibling .md", () => {
    //#given a plan with both artefacts, the markdown carrying a different tier
    writeSidecar("delta", sidecar({ plan: "delta", plannedEffort: "Large" }))
    writeFileSync(join(reviewsDir, "delta.md"), "# Report\n\n**Planned**: Small\n", "utf8")

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the sidecar is the data and the markdown text is nowhere in the output
    expect(corpus.effortTiers).toEqual([{ verbatim: "Large", count: 1 }])
    expect(corpus.skipped.some((s) => s.file === "delta.md")).toBe(true)
  })

  test("counts a markdown-only review without recovering numbers from its prose", () => {
    //#given a review written before the sidecar existed
    writeFileSync(join(reviewsDir, "legacy.md"), "# Report\n\n**Planned**: Large\n", "utf8")

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the plan is counted as a fallback and contributes no structured row
    expect(corpus.markdownFallbackCount).toBe(1)
    expect(corpus.sampleCount).toBe(0)
    expect(corpus.effortTiers).toEqual([])
  })
})

describe("readCalibrationCorpus — nothing is dropped in silence", () => {
  test("counts an unparseable sidecar in skipped and keeps it out of sampleCount", () => {
    //#given one good sidecar and one that is not JSON
    writeSidecar("good", sidecar({ plan: "good" }))
    writeFileSync(join(reviewsDir, "broken.json"), "{ not json", "utf8")

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the bad file is reported with a reason rather than vanishing
    expect(corpus.sampleCount).toBe(1)
    expect(corpus.skipped).toHaveLength(1)
    expect(corpus.skipped[0]?.file).toBe("broken.json")
    expect(corpus.skipped[0]?.reason).toContain("not valid JSON")
  })

  test("refuses a sidecar whose version it does not understand", () => {
    //#given a sidecar carrying a version this reader does not know
    const alien = { ...sidecar({ plan: "alien" }), sidecarVersion: "9.9.9" }
    writeSidecar("alien", alien)

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then it is refused outright, not partially interpreted
    expect(corpus.sampleCount).toBe(0)
    expect(corpus.skipped[0]?.reason).toContain("not a version 1.0.0 review sidecar")
  })
})

describe("readCalibrationCorpus — aggregation shape", () => {
  test("groups verbatim effort tiers with their counts and never invents a level", () => {
    //#given three plans recording two different verbatim tiers
    writeSidecar("a", sidecar({ plan: "a", plannedEffort: "Large" }))
    writeSidecar("b", sidecar({ plan: "b", plannedEffort: "Large" }))
    writeSidecar("c", sidecar({ plan: "c", plannedEffort: "Medium (≈1–2 agent-days)" }))

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then tiers are counted as text, most frequent first, free-form text intact
    expect(corpus.effortTiers).toEqual([
      { verbatim: "Large", count: 2 },
      { verbatim: "Medium (≈1–2 agent-days)", count: 1 },
    ])
  })

  test("reports complexityTiers as empty because no plan stores a Complexity level", () => {
    //#given plans with no **Complexity** line recorded
    writeSidecar("a", sidecar({ plan: "a", plannedComplexity: null }))
    writeSidecar("b", sidecar({ plan: "b", plannedComplexity: null }))

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then the absence is visible rather than implied, and no level is synthesised
    expect(corpus.complexityTiers).toEqual([])
    expect(corpus.sampleCount).toBe(2)
  })

  test("counts code+dimensionId pairs, so E6 across five dimensions is five rows", () => {
    //#given one plan whose five MODEL dimensions each emitted the E6 catch-all
    const modelDimensions = ["d1", "d2", "d3", "d4", "d5"]
    writeSidecar("wide", sidecar({ plan: "wide", findings: modelDimensions.map((d) => finding("E6", d)) }))
    writeSidecar("narrow", sidecar({ plan: "narrow", findings: [finding("E6", "d1")] }))

    //#when the corpus is read
    const corpus = readCalibrationCorpus(reviewsDir)

    //#then E6+d1 is the only pair shared by both plans; the rest are single-plan rows
    expect(corpus.findingPairs[0]).toEqual({ code: "E6", dimensionId: "d1", count: 2 })
    expect(corpus.findingPairs).toHaveLength(5)
    expect(corpus.sampleCount).toBe(2)
  })
})

describe("readCalibrationCorpus — the corpus feeds back into nothing", () => {
  test("no completion-review source file references the routing-only complexity heuristic", () => {
    //#given every source file in the completion-review feature
    const srcDir = join(import.meta.dir, "../../../src/features/completion-review")
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"))

    //#when each file is read
    const offenders = files.filter((f) => {
      const text = readFileSync(join(srcDir, f), "utf8")
      return text.includes("autoScoreComplexity") || text.includes("COMPLEXITY_DESCRIPTIONS")
    })

    //#then the routing heuristic stays out of the reviewer's vocabulary entirely
    expect(offenders).toEqual([])
  })

  test("the corpus modules import no gate, scorer or router", () => {
    //#given the corpus reader and its siblings
    const srcDir = join(import.meta.dir, "../../../src/features/completion-review")
    const files = readdirSync(srcDir).filter((f) => f.startsWith("calibration-corpus") && f.endsWith(".ts"))

    //#when each file's import statements are read
    // (statement-anchored: the doc comments legitimately name these subsystems)
    const importing = files.filter((f) => {
      const text = readFileSync(join(srcDir, f), "utf8")
      const imports = text.match(/^(import|export) .*from ".*"$/gm) ?? []
      return imports.some((line) => /\b(gate|scorer|router|complexity)\b/.test(line))
    })

    //#then the corpus is a leaf: it reads sidecars and returns a report, nothing more
    expect(files.length).toBeGreaterThan(0)
    expect(importing).toEqual([])
  })

  test("the reader is pure: the same directory twice yields an identical report", () => {
    //#given a directory with one written review
    writeSidecar("a", sidecar({ plan: "a", findings: [finding("E1", "dod-coverage")] }))

    //#when it is read twice
    const first = readCalibrationCorpus(reviewsDir)
    const second = readCalibrationCorpus(reviewsDir)

    //#then reading it changes nothing, which is what "no feedback" requires
    expect(second).toEqual(first)
  })
})
