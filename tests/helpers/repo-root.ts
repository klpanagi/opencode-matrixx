import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

/**
 * Resolve the repository root independently of the process working directory.
 *
 * Test files must not assume `bun test` was invoked from the repo root. A
 * relative path like `Bun.file("docs/orchestration.md")` silently resolves
 * against `process.cwd()`, so the same suite is green locally and red in any
 * other directory. This helper anchors on the caller's own location instead.
 *
 * The root marker is `package.json` PLUS `src/index.ts`: `package.json` alone
 * would match a nested fixture or a vendored copy, and a single file check can
 * be satisfied by a directory that is not the project we mean.
 */

const ROOT_MARKER_FILES = ["package.json", join("src", "index.ts")] as const

function hasRootMarker(dir: string): boolean {
  return ROOT_MARKER_FILES.every((entry) => existsSync(join(dir, entry)))
}

/**
 * Walk up from this module's own directory to the repository root.
 *
 * Not cached: another test file's `mock.module("node:fs")` can make
 * `existsSync` report a root marker in the wrong directory, and a cached wrong
 * answer would then poison every later call in the process. The walk is a
 * handful of `existsSync` calls, so correctness is worth the microseconds.
 */
export function repoRoot(): string {
  // The module's own directory is correct by construction and independent of
  // the process working directory.
  let dir = dirname(new URL(import.meta.url).pathname)

  // Guard against walking off the filesystem root.
  for (;;) {
    if (hasRootMarker(dir)) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(
        `repoRoot(): no repository root found walking up from ${dirname(new URL(import.meta.url).pathname)}. ` +
          `Expected a directory containing ${ROOT_MARKER_FILES.join(", ")}.`,
      )
    }
    dir = parent
  }
}

/**
 * Build an absolute path to a repository file, cwd-independent.
 *
 * Usage: `await Bun.file(repoPath("docs/orchestration.md")).text()`
 * instead of `await Bun.file("docs/orchestration.md").text()`.
 */
export function repoPath(...segments: string[]): string {
  return resolve(repoRoot(), ...segments)
}
