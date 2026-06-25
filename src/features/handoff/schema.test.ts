import { describe, expect, test } from "bun:test"
import {
  HandoffFrontmatterSchema,
  HandoffSchema,
  HandoffSectionSchema,
} from "./schema"

describe("HandoffFrontmatterSchema", () => {
  test("accepts valid frontmatter with all required fields", () => {
    //#given - a complete handoff frontmatter object
    const frontmatter = {
      session_id: "ses_abc123",
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: {
        sha: "a1b2c3d4e5f6",
        branch: "feat/handoff-rewire",
        detached: false,
      },
      topics: ["handoff", "schema", "zod"],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.session_id).toBe("ses_abc123")
      expect(result.data.git_head.sha).toBe("a1b2c3d4e5f6")
      expect(result.data.topics).toHaveLength(3)
    }
  })

  test("accepts minimal frontmatter (branch and detached optional)", () => {
    //#given - frontmatter with only required fields
    const frontmatter = {
      session_id: "ses_xyz",
      timestamp: "2025-06-25T12:00:00.000Z",
      git_head: { sha: "deadbeef" },
      topics: ["minimal"],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.git_head.branch).toBeUndefined()
      expect(result.data.git_head.detached).toBeUndefined()
    }
  })

  test("rejects missing session_id", () => {
    //#given - frontmatter without session_id
    const frontmatter = {
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: { sha: "abc" },
      topics: ["x"],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects invalid timestamp (not ISO 8601)", () => {
    //#given - frontmatter with non-ISO timestamp
    const frontmatter = {
      session_id: "ses_1",
      timestamp: "yesterday",
      git_head: { sha: "abc" },
      topics: ["x"],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects non-array topics", () => {
    //#given - frontmatter with topics as string
    const frontmatter = {
      session_id: "ses_1",
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: { sha: "abc" },
      topics: "handoff",
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects empty topics array", () => {
    //#given - frontmatter with empty topics
    const frontmatter = {
      session_id: "ses_1",
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: { sha: "abc" },
      topics: [],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects missing git_head.sha", () => {
    //#given - git_head without sha
    const frontmatter = {
      session_id: "ses_1",
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: { branch: "main" },
      topics: ["x"],
    }

    //#when
    const result = HandoffFrontmatterSchema.safeParse(frontmatter)

    //#then
    expect(result.success).toBe(false)
  })
})

describe("HandoffSectionSchema", () => {
  const validSections = {
    user_requests: "Implement handoff schema",
    goal: "Replace fragile template with structured YAML",
    work_completed: ["created schema", "wrote tests"],
    current_state: "Task 1 in progress",
  }

  test("accepts required fields only", () => {
    //#given
    const sections = { ...validSections }

    //#when
    const result = HandoffSectionSchema.safeParse(sections)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.user_requests).toBe("Implement handoff schema")
      expect(result.data.work_completed).toHaveLength(2)
    }
  })

  test("accepts all optional fields", () => {
    //#given
    const sections = {
      ...validSections,
      pending_tasks: ["task A", "task B"],
      key_files: [{ path: "src/foo.ts", purpose: "demo" }],
      important_decisions: [{ decision: "use js-yaml", rationale: "already in deps" }],
      explicit_constraints: ["no new deps"],
      context_for_continuation: "Continue from Task 2",
    }

    //#when
    const result = HandoffSectionSchema.safeParse(sections)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pending_tasks).toHaveLength(2)
      expect(result.data.key_files?.[0].path).toBe("src/foo.ts")
      expect(result.data.important_decisions?.[0].decision).toBe("use js-yaml")
    }
  })

  test("rejects missing user_requests", () => {
    //#given
    const sections = {
      goal: "x",
      work_completed: [],
      current_state: "x",
    }

    //#when
    const result = HandoffSectionSchema.safeParse(sections)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects work_completed as non-array", () => {
    //#given
    const sections = {
      user_requests: "x",
      goal: "x",
      work_completed: "created schema",
      current_state: "x",
    }

    //#when
    const result = HandoffSectionSchema.safeParse(sections)

    //#then
    expect(result.success).toBe(false)
  })

  test("accepts empty work_completed array", () => {
    //#given - work_completed may be empty if nothing done yet
    const sections = {
      user_requests: "x",
      goal: "x",
      work_completed: [],
      current_state: "starting",
    }

    //#when
    const result = HandoffSectionSchema.safeParse(sections)

    //#then
    expect(result.success).toBe(true)
  })
})

describe("HandoffSchema", () => {
  const validHandoff = {
    frontmatter: {
      session_id: "ses_abc",
      timestamp: "2025-06-25T10:30:00.000Z",
      git_head: { sha: "abc123" },
      topics: ["handoff"],
    },
    sections: {
      user_requests: "x",
      goal: "y",
      work_completed: [],
      current_state: "z",
    },
  }

  test("accepts complete handoff object", () => {
    //#given
    const handoff = { ...validHandoff }

    //#when
    const result = HandoffSchema.safeParse(handoff)

    //#then
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.frontmatter.session_id).toBe("ses_abc")
      expect(result.data.sections.goal).toBe("y")
    }
  })

  test("rejects when frontmatter is invalid", () => {
    //#given
    const handoff = {
      frontmatter: { session_id: "ses_abc" }, // missing required
      sections: validHandoff.sections,
    }

    //#when
    const result = HandoffSchema.safeParse(handoff)

    //#then
    expect(result.success).toBe(false)
  })

  test("rejects when sections is invalid", () => {
    //#given
    const handoff = {
      frontmatter: validHandoff.frontmatter,
      sections: { user_requests: "x" }, // missing required
    }

    //#when
    const result = HandoffSchema.safeParse(handoff)

    //#then
    expect(result.success).toBe(false)
  })
})
