/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const SRC = join(REPO_ROOT, "src")
const FEATURE = join(SRC, "features/completion-review")
const SOLE_IMPORTER = "features/builtin-commands/templates/plan-review.ts"

/** Directories an automatic trigger could plausibly hide in. Zero hits required. */
const AUTOMATION_DIRS = ["hooks", "plugin-handlers", "plugin"]

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".test.ts")) acc.push(full)
  }
  return acc
}

/** Every relative import specifier in a source file, as written. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf-8")
  const specifiers: string[] = []
  const patterns = [
    /from\s+"(\.[^"]*)"/g,
    /import\s*\(\s*"(\.[^"]*)"\s*\)/g,
    /require\(\s*"(\.[^"]*)"\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1])
    }
  }
  return specifiers
}

/**
 * Walk the whole module graph from `src/` and collect every file OUTSIDE
 * `features/completion-review/` that imports something INSIDE it.
 *
 * This walks the graph rather than grepping for the directory name, because the
 * modules inside the feature legitimately reference it — a
 * `--files-with-matches` assertion would therefore return five or more correct
 * hits and prove nothing about AUTOMATION.
 */
function importersOutsideFeature(): string[] {
  const importers = new Set<string>()
  for (const file of walk(SRC)) {
    if (file.startsWith(FEATURE)) continue
    for (const specifier of importsOf(file)) {
      if (!specifier.includes("completion-review")) continue
      importers.add(relative(SRC, file))
    }
  }
  return [...importers].sort()
}

describe("locked decision #3 — the review is unreachable from automation", () => {
  test("the ONLY importer of completion-review/** outside it is the command template", () => {
    //#given the whole src/ module graph
    //#when every external importer of the feature is collected
    const importers = importersOutsideFeature()

    //#then the set is exactly the command template — one file, no more
    expect(importers).toEqual([SOLE_IMPORTER])
  })

  test("NO file under src/hooks/ imports the feature", () => {
    //#given the whole src/ module graph
    //#when every external importer of the feature is collected
    const importers = importersOutsideFeature()

    //#then no hook, at any depth, is among them
    expect(importers.filter((f) => f.startsWith("hooks/"))).toEqual([])
  })

  test("NO file under src/hooks/architect/ imports the feature", () => {
    //#given the whole src/ module graph
    //#when every external importer of the feature is collected
    const importers = importersOutsideFeature()

    //#then the architect hook does not reach it
    expect(importers.filter((f) => f.startsWith("hooks/architect/"))).toEqual([])
  })

  test("NO file under src/plugin-handlers/ imports the feature", () => {
    //#given the whole src/ module graph
    //#when every external importer of the feature is collected
    const importers = importersOutsideFeature()

    //#then no plugin handler reaches it either
    expect(importers.filter((f) => f.startsWith("plugin-handlers/"))).toEqual([])
  })

  test("no automation directory references the command or the feature at all", () => {
    //#given the automation surfaces where an automatic trigger would live
    //#when their sources are scanned
    const hits: string[] = []
    for (const dir of AUTOMATION_DIRS) {
      for (const file of walk(join(SRC, dir))) {
        const source = readFileSync(file, "utf-8")
        if (/plan-review|planReview|completion-review/.test(source)) {
          hits.push(relative(SRC, file))
        }
      }
    }

    //#then nothing there mentions the review in any spelling
    expect(hits).toEqual([])
  })
})
