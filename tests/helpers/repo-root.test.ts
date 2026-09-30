import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { repoPath, repoRoot } from "./repo-root"

/**
 * Proves the test suite does not depend on the process working directory.
 *
 * Every other test in this repo implicitly assumes it is run from the repo
 * root. That assumption is invisible until someone runs `bun test` from
 * elsewhere, at which point the failures look like real product bugs.
 * These tests make the invariant explicit and enforced.
 */

let originalCwd: string | undefined
let tempDir: string | undefined

function chdirToFreshTemp(): string {
  const dir = mkdtempSync(join(tmpdir(), "repo-root-cwd-probe-"))
  originalCwd = process.cwd()
  process.chdir(dir)
  tempDir = dir
  return dir
}

afterEach(() => {
  // Restore cwd BEFORE removing the temp dir. Deleting the directory we are
  // standing in leaves the process with a dangling cwd, and the next
  // process.cwd() throws ENOENT (uv_cwd) — a confusing failure that looks
  // like a bug in the code under test.
  if (originalCwd !== undefined) {
    process.chdir(originalCwd)
    originalCwd = undefined
  }
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe("repoRoot", () => {
  test("resolves the repository root without depending on cwd", () => {
    const dir = chdirToFreshTemp()

    //#when resolved from a foreign working directory
    //#then it is still the real repo root, proven by its own markers
    const root = repoRoot()
    expect(existsSync(join(root, "package.json"))).toBe(true)
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true)
    expect(existsSync(join(root, "src", "index.ts"))).toBe(true)
    //#and it did not resolve to the temp directory we are standing in
    expect(root).not.toBe(dir)
  })

  test("is stable across a cwd change", () => {
    const fromRepoRoot = repoRoot()
    chdirToFreshTemp()

    //#when asked twice from two different working directories
    //#then both calls agree
    expect(repoRoot()).toBe(fromRepoRoot)
  })
})

describe("repoPath", () => {
  test("builds an absolute path that resolves from a foreign cwd", async () => {
    chdirToFreshTemp()

    //#given a repo file addressed relative to the repo root
    const p = repoPath("package.json")

    //#then the path is absolute, not cwd-relative
    expect(p.startsWith("/")).toBe(true)
    //#and it is readable from a foreign working directory
    const content = await Bun.file(p).text()
    expect(content).toContain('"name"')
  })

  test("joins multiple segments", () => {
    expect(repoPath("src", "cli", "setup", "prompts.ts")).toBe(
      join(repoRoot(), "src", "cli", "setup", "prompts.ts")
    )
  })
})
