import { describe, expect, test } from "bun:test"
import { validateHandoffYaml } from "../../../src/features/handoff/validate"

describe("validateHandoffYaml", () => {
  test("returns valid=true with data for correct YAML", () => {
    //#given - a complete handoff document with nested frontmatter + sections
    const content = `---
frontmatter:
  session_id: ses_abc
  timestamp: 2025-06-25T10:30:00.000Z
  git_head:
    sha: abc123def
    branch: main
    detached: false
  topics:
    - handoff
    - schema
sections:
  user_requests: Implement handoff schema
  goal: Replace fragile template with structured YAML
  work_completed:
    - created schema
    - wrote tests
  current_state: Task 1 complete
---
# Handoff Notes
Some body content here.
`

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(true)
    if (result.data) {
      expect(result.data.frontmatter.session_id).toBe("ses_abc")
      expect(result.data.frontmatter.git_head.sha).toBe("abc123def")
      expect(result.data.frontmatter.topics).toEqual(["handoff", "schema"])
      expect(result.data.sections.user_requests).toBe("Implement handoff schema")
    }
  })

  test("returns valid=false with errors for malformed YAML", () => {
    //#given - invalid YAML syntax in frontmatter
    const content = `---
invalid: yaml: syntax: here
  bad indentation
---
body
`

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.errors).toBeDefined()
    expect(result.errors?.length).toBeGreaterThan(0)
  })

  test("returns valid=false with errors for missing required fields", () => {
    //#given - frontmatter missing session_id and topics
    const content = `---
frontmatter:
  timestamp: 2025-06-25T10:30:00.000Z
  git_head:
    sha: abc
sections:
  user_requests: x
  goal: y
  work_completed: []
  current_state: z
---
body content
`

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.errors).toBeDefined()
    expect(result.errors?.length).toBeGreaterThan(0)
    // field-level error mentions the missing field
    const joined = result.errors?.join(" ").toLowerCase() ?? ""
    expect(joined).toContain("session_id")
  })

  test("returns valid=false when there is no frontmatter", () => {
    //#given - content with no frontmatter block
    const content = "Just plain body, no frontmatter here.\n"

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(false)
    expect(result.data).toBeUndefined()
    expect(result.errors).toBeDefined()
  })

  test("includes field path in error messages", () => {
    //#given - frontmatter with wrong type for git_head
    const content = `---
frontmatter:
  session_id: ses_1
  timestamp: 2025-06-25T10:30:00.000Z
  git_head: "not-an-object"
  topics:
    - x
sections:
  user_requests: x
  goal: y
  work_completed: []
  current_state: z
---
body
`

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    const joined = result.errors?.join(" ").toLowerCase() ?? ""
    expect(joined).toContain("git_head")
  })

  test("does not throw on invalid input", () => {
    //#given - completely broken content
    const content = ""

    //#when / #then - must not throw
    expect(() => validateHandoffYaml(content)).not.toThrow()
    const result = validateHandoffYaml(content)
    expect(result.valid).toBe(false)
  })

  test("preserves body when validation succeeds", () => {
    //#given - a handoff with multi-line markdown body
    const body = `# Goal
Implement handoff rewire.

## Details
- Step 1
- Step 2
`
    const content = `---
frontmatter:
  session_id: ses_1
  timestamp: 2025-06-25T10:30:00.000Z
  git_head:
    sha: abc
  topics:
    - handoff
sections:
  user_requests: x
  goal: y
  work_completed: []
  current_state: z
---
${body}`

    //#when
    const result = validateHandoffYaml(content)

    //#then
    expect(result.valid).toBe(true)
    if (result.data) {
      expect(result.data.body).toBe(body)
    }
  })
})
