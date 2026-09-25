/**
 * Plan Contract — Appendix Boundary
 *
 * Locates the designated appendix region of a plan. The region begins at the
 * first H2 whose normalized text is exactly `Appendix` and extends to EOF.
 * H2s at/after it are exempt from canonical-section and ordering checks.
 *
 * Pure content-level helper — accepts a string only, never touches the file system.
 */

/** Matches an H2 heading and captures its title text. */
const H2_RE = /^##\s+(.+)$/

/**
 * Return the ZERO-BASED line index of the first `## Appendix` H2, or `-1` when
 * the plan has no appendix. "Normalized" means the heading text is trimmed.
 */
export function findAppendixStart(content: string): number {
  const lines = content.split("\n")
  for (let index = 0; index < lines.length; index++) {
    const match = H2_RE.exec(lines[index] ?? "")
    if (match && match[1].trim() === "Appendix") {
      return index
    }
  }
  return -1
}
