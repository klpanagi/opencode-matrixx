/// <reference types="bun-types" />
/**
 * Structural fence for the `task_create(...)` examples taught in prompts.
 *
 * The 8 broken call sites (Task 4) all taught the same shape: a top-level
 * ARRAY carrying `status` (and, once, no `priority`). Those were prose in a
 * template literal, so nothing but a test could hold them to the real schema.
 *
 * This validator reads the examples straight out of `src/**` and parses each
 * one with the SAME schemas `parseCreateArgs` uses, so the valid shape is
 * PROVEN by the schema and never re-asserted here.
 *
 * Extraction is a balanced-delimiter scan, not a regex, because:
 *   - examples are multi-line and one of them (`refactor.ts`) carries `//`
 *     comment lines INSIDE the array,
 *   - a `)` or `]` inside a string or a comment must not close the literal,
 *   - the examples live inside template literals whose backticks are escaped.
 */
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { TaskCreateBatchInputSchema, TaskCreateInputSchema } from "../../../src/tools/task/types"

const ROOT = join(import.meta.dir, "../../..")
const SRC = join(ROOT, "src")

/** Canonical single-object example, pinned by the plan. */
const CANONICAL_MD = "src/tools/AGENTS.md"
const CANONICAL_LINE = 93

type Extracted = {
  rel: string
  line: number
  source: string
}

function walk(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) out.push(...walk(abs, ext))
    else if (entry.endsWith(ext)) out.push(abs)
  }
  return out
}

/**
 * Balanced scan of the argument list beginning at the `(` after `from`.
 * Strings (", ', `) and both comment forms are consumed verbatim so a
 * delimiter inside them never affects the depth count.
 */
function extractCallArgs(src: string, from: number): { text: string; end: number } {
  const start = src.indexOf("(", from)
  if (start === -1) throw new Error(`no ( after offset ${from}`)
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === "\\") i++
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c
      continue
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2)
      if (i === -1) throw new Error("unterminated block comment")
      i++
      continue
    }
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) return { text: src.slice(start + 1, i), end: i }
    }
  }
  throw new Error(`unbalanced call args from offset ${from}`)
}

function extractExamples(abs: string, rel: string): Extracted[] {
  const src = readFileSync(abs, "utf8")
  const found: Extracted[] = []
  let idx = -1
  while ((idx = src.indexOf("task_create(", idx + 1)) !== -1) {
    const callAt = idx
    const { text, end } = extractCallArgs(src, callAt)
    idx = end
    found.push({ rel, line: src.slice(0, callAt).split("\n").length, source: text })
  }
  return found
}

const tsExamples = walk(SRC, ".ts")
  .map((abs) => extractExamples(abs, abs.slice(ROOT.length + 1)))
  .flat()
const mdExamples = walk(SRC, ".md")
  .map((abs) => extractExamples(abs, abs.slice(ROOT.length + 1)))
  .flat()

/**
 * The raw source text IS the expression the reader of the prompt sees, so it
 * is evaluated as-is: the same escapes the TypeScript template literal applies
 * are applied here. Unescaping first would only test a different value.
 */
function evaluate(example: Extracted): unknown {
  return eval(`(${example.source})`)
}

type Issue = string
function issuesOf(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): Issue[] {
  if (result.success || !result.error) return []
  return result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
}

/**
 * Mirrors `parseCreateArgs` in `src/tools/task/task-create.ts` exactly:
 * `items` present -> batch envelope, otherwise the single-object form. Each
 * batch item is validated SEPARATELY with `TaskCreateInputSchema`, because
 * `items` is `z.unknown()`-shaped and the envelope alone cannot see a bad item.
 */
function validate(example: Extracted): Issue[] {
  let value: unknown
  try {
    value = evaluate(example)
  } catch (e) {
    return [`not a valid JavaScript literal: ${(e as Error).message}`]
  }
  if (typeof value !== "object" || value === null) return [`expected an object, got ${typeof value}`]

  if (Object.hasOwn(value, "items")) {
    const batch = TaskCreateBatchInputSchema.safeParse(value)
    if (!batch.success) return issuesOf(batch)
    const items: unknown[] = (value as { items: unknown[] }).items
    return items.flatMap((item, i) =>
      issuesOf(TaskCreateInputSchema.safeParse(item)).map((m) => `items[${i}] ${m}`),
    )
  }
  return issuesOf(TaskCreateInputSchema.safeParse(value))
}

function report(): string {
  return [...tsExamples, ...mdExamples]
    .map((e) => `  ${e.rel}:${e.line} -> ${validate(e).join("; ") || "OK"}`)
    .join("\n")
}

describe("task_create example validator", () => {
  test("the source corpus contains examples (non-vacuous)", () => {
    //#given the src tree is walked for `task_create(` in .ts and .md files
    //#when the extraction runs
    //#then each corpus is non-empty, so an empty scan can never pass
    expect(tsExamples.length).toBeGreaterThanOrEqual(1)
    expect(mdExamples.length).toBeGreaterThanOrEqual(1)
  })

  test("every task_create example in src parses with the real schema", () => {
    //#given every `task_create(` literal found in src/**/*.ts and src/**/*.md
    //#when each is evaluated and parsed the way parseCreateArgs parses it
    //#then no example reports an issue
    const failures = [...tsExamples, ...mdExamples]
      .map((e) => ({ e, issues: validate(e) }))
      .filter(({ issues }) => issues.length > 0)
    expect(failures.map((f) => `${f.e.rel}:${f.e.line} -> ${f.issues.join("; ")}`).join("\n")).toBe("")
  })

  test("the canonical single-object example parses", () => {
    //#given the documented canonical form in src/tools/AGENTS.md
    const canonical = mdExamples.filter((e) => e.rel === CANONICAL_MD && e.line === CANONICAL_LINE)
    //#when it is parsed with the real schema
    //#then it exists exactly once and is accepted
    expect(canonical.length).toBe(1)
    expect(validate(canonical[0])).toEqual([])
  })

  test("the scan is not silently narrow", () => {
    //#given the eight fixed prompt files plus the documented example
    //#when locations are grouped by file
    //#then all of them contributed at least one example
    const byFile = new Map<string, number>()
    for (const e of [...tsExamples, ...mdExamples])
      byFile.set(e.rel, (byFile.get(e.rel) ?? 0) + 1)
    console.log(report())
    expect(byFile.size).toBeGreaterThanOrEqual(8)
    expect([...byFile.keys()].every((f) => f.startsWith("src/"))).toBe(true)
  })
})
