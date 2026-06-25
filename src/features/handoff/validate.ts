import { parseFrontmatter } from "../../shared/frontmatter"
import { type HandoffFileData, HandoffSchema } from "./schema"

/**
 * Result of validating a handoff markdown document.
 */
export type HandoffValidationResult =
  | { valid: true; data: HandoffFileData }
  | { valid: false; errors: string[]; data?: undefined }

/**
 * Parse and validate a handoff markdown document.
 *
 * Reuses `parseFrontmatter` from `src/shared/frontmatter` to extract the
 * YAML block, then validates with `HandoffSchema`. The markdown body is
 * preserved in `data.body` so callers can render it without re-parsing.
 *
 * Never throws — returns a structured error result on any failure.
 */
export function validateHandoffYaml(content: string): HandoffValidationResult {
  //#when - parse frontmatter + body
  const { data: frontmatter, body, hadFrontmatter, parseError } = parseFrontmatter<Record<string, unknown>>(content)

  if (!hadFrontmatter) {
    return { valid: false, errors: ["Missing YAML frontmatter block (---...---)"] }
  }
  if (parseError) {
    return { valid: false, errors: ["Malformed YAML in frontmatter"] }
  }

  //#when - validate parsed data against schema
  const result = HandoffSchema.safeParse(frontmatter)
  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
      return `${path}: ${issue.message}`
    })
    return { valid: false, errors }
  }

  //#then - return validated data with body preserved
  return { valid: true, data: { ...result.data, body } }
}
