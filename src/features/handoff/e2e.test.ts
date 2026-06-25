/**
 * End-to-end handoff lifecycle test.
 *
 * Exercises the full create → read → archive → re-read-fails flow against
 * the real storage layer (no mocking). Verifies that:
 *  - The `handoff` tool dispatches the right handler for each `action`
 *  - Storage writes/reads/renames happen on the real filesystem
 *  - YAML frontmatter round-trips through `validateHandoffYaml`
 *  - Edge cases (missing dir, empty file, malformed YAML, full payload) all behave
 *    as documented.
 *
 * Each test uses a unique tmpdir subpath to stay isolated even when the file is
 * executed in parallel with other test files.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { getHandoffConsumedFilePath, getHandoffFilePath } from "./"
import { validateHandoffYaml } from "./validate"

/** Minimal PluginInput mock — only `directory` is consumed by the handoff tool. */
function makeCtx(directory: string): PluginInput {
  return {
    client: {} as PluginInput["client"],
    directory,
    project: {} as PluginInput["project"],
    worktree: directory,
    serverUrl: new URL("http://localhost:0"),
    $: {} as PluginInput["$"],
  } as PluginInput
}

function makeContext(sessionID: string, directory: string) {
  return {
    sessionID,
    messageID: "msg-e2e",
    agent: "test-agent",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
  }
}

const BASE_CREATE_ARGS = {
  topics: ["e2e", "lifecycle"],
  user_requests: "Continue the auth refactor and run tests",
  goal: "Finish the auth refactor and ship",
  work_completed: ["Wrote the schema", "Migrated the tool", "Updated the templates"],
  current_state: "Implementation complete; docs and E2E pending",
} as const

describe("handoff e2e lifecycle", () => {
  // Unique top-level tmpdir per file run — avoids cross-test pollution when
  // the test file is executed alongside other test files.
  const TEST_DIR = join(tmpdir(), `handoff-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  // ---------------- Test 1: Full lifecycle ----------------
  test("full lifecycle: create → read → archive → re-read-fails", async () => {
    //#given - a fresh project dir and the handoff tool
    const projectDir = join(TEST_DIR, "lifecycle")
    mkdirSync(projectDir, { recursive: true })
    const { createHandoffTools } = await import("../../tools/handoff/tools")
    const tools = createHandoffTools(makeCtx(projectDir))
    const context = makeContext("ses_e2e_lifecycle", projectDir)

    //#when - create
    const createResult = await tools.handoff.execute(
      { action: "create", ...BASE_CREATE_ARGS },
      context
    )

    //#then - handoff.md exists, create message confirms write
    const filePath = getHandoffFilePath(projectDir)
    expect(existsSync(filePath)).toBe(true)
    expect(createResult).toContain("Handoff written to")
    expect(createResult).toContain("ses_e2e_lifecycle")

    //#then - frontmatter parses through HandoffSchema via validateHandoffYaml
    const onDisk = readFileSync(filePath, "utf-8")
    const validation = validateHandoffYaml(onDisk)
    expect(validation.valid).toBe(true)
    if (!validation.valid) throw new Error("unreachable")
    expect(validation.data.frontmatter.session_id).toBe("ses_e2e_lifecycle")
    expect(validation.data.frontmatter.topics).toEqual(["e2e", "lifecycle"])
    expect(validation.data.sections.goal).toBe(BASE_CREATE_ARGS.goal)
    expect(validation.data.body.length).toBeGreaterThan(0)

    //#when - read returns the same content
    const readResult = await tools.handoff.execute({ action: "read" }, context)
    //#then - read returns full content (frontmatter + body)
    expect(readResult).toContain("---")
    expect(readResult).toContain("session_id: ses_e2e_lifecycle")
    expect(readResult).toContain("Finish the auth refactor and ship")

    //#when - archive
    const archiveResult = await tools.handoff.execute({ action: "archive" }, context)
    //#then - archive message + file moved
    const consumedPath = getHandoffConsumedFilePath(projectDir)
    expect(archiveResult).toContain("Handoff archived")
    expect(existsSync(filePath)).toBe(false)
    expect(existsSync(consumedPath)).toBe(true)

    //#when - re-read after archive
    const reReadResult = await tools.handoff.execute({ action: "read" }, context)
    //#then - clear error
    expect(reReadResult).toMatch(/^Error:/)
    expect(reReadResult).toContain("No handoff found at")
    expect(reReadResult).toContain(".matrixx/handoff.md")
  })

  // ---------------- Test 2: Missing .matrixx/ dir ----------------
  test("create auto-creates the .matrixx/ directory when it does not exist", async () => {
    //#given - a project dir with NO .matrixx/ inside it
    const projectDir = join(TEST_DIR, "no-matrixx-dir")
    mkdirSync(projectDir, { recursive: true })
    expect(existsSync(join(projectDir, ".matrixx"))).toBe(false)
    const { createHandoffTools } = await import("../../tools/handoff/tools")
    const tools = createHandoffTools(makeCtx(projectDir))
    const context = makeContext("ses_e2e_mkdir", projectDir)

    //#when - create
    const result = await tools.handoff.execute(
      { action: "create", ...BASE_CREATE_ARGS },
      context
    )

    //#then - .matrixx/ was created and handoff.md lives inside it
    expect(existsSync(join(projectDir, ".matrixx"))).toBe(true)
    expect(existsSync(getHandoffFilePath(projectDir))).toBe(true)
    expect(result).toContain("Handoff written to")
  })

  // ---------------- Test 3: Empty file on disk ----------------
  test("read returns a warning when the on-disk handoff file is empty", async () => {
    //#given - an empty handoff.md (no frontmatter, no body)
    const projectDir = join(TEST_DIR, "empty-file")
    mkdirSync(join(projectDir, ".matrixx"), { recursive: true })
    writeFileSync(getHandoffFilePath(projectDir), "", "utf-8")
    const { createHandoffTools } = await import("../../tools/handoff/tools")
    const tools = createHandoffTools(makeCtx(projectDir))
    const context = makeContext("ses_e2e_empty", projectDir)

    //#when
    const result = await tools.handoff.execute({ action: "read" }, context)

    //#then - explicit warning (not a silent no-op, not a hard error)
    expect(result).toMatch(/^Warning:/)
    expect(result).toContain("failed schema validation")
  })

  // ---------------- Test 4: All optional fields populated ----------------
  test("create persists every optional field and they round-trip through HandoffSchema", async () => {
    //#given - create args with EVERY field populated
    const projectDir = join(TEST_DIR, "all-fields")
    mkdirSync(projectDir, { recursive: true })
    const { createHandoffTools } = await import("../../tools/handoff/tools")
    const tools = createHandoffTools(makeCtx(projectDir))
    const context = makeContext("ses_e2e_full", projectDir)
    const fullArgs = {
      action: "create" as const,
      ...BASE_CREATE_ARGS,
      pending_tasks: ["Run full CI", "Open PR to dev"],
      key_files: [
        { path: "src/tools/handoff/tools.ts", purpose: "Multi-action dispatcher" },
        { path: "src/features/handoff/schema.ts", purpose: "Zod validation" },
      ],
      important_decisions: [
        { decision: "Single multi-action tool", rationale: "Templates call all 4 actions" },
        { decision: "YAML frontmatter + markdown body", rationale: "Schema-validated + human-readable" },
      ],
      explicit_constraints: ["Hard cutover — no legacy format support"],
      context_for_continuation: "Next: land E2E + docs, then publish",
    }

    //#when
    const result = await tools.handoff.execute(fullArgs, context)

    //#then - file written
    expect(result).toContain("Handoff written to")
    const filePath = getHandoffFilePath(projectDir)
    expect(existsSync(filePath)).toBe(true)

    //#then - all optional fields round-trip through HandoffSchema
    const onDisk = readFileSync(filePath, "utf-8")
    const validation = validateHandoffYaml(onDisk)
    expect(validation.valid).toBe(true)
    if (!validation.valid) throw new Error("unreachable")
    expect(validation.data.sections.pending_tasks).toEqual(["Run full CI", "Open PR to dev"])
    expect(validation.data.sections.key_files).toHaveLength(2)
    expect(validation.data.sections.key_files?.[0].path).toBe("src/tools/handoff/tools.ts")
    expect(validation.data.sections.important_decisions).toHaveLength(2)
    expect(validation.data.sections.explicit_constraints).toEqual([
      "Hard cutover — no legacy format support",
    ])
    expect(validation.data.sections.context_for_continuation).toBe(
      "Next: land E2E + docs, then publish"
    )
  })

  // ---------------- Test 5: Schema-invalid handoff on disk ----------------
  test("read is forgiving when the on-disk handoff has malformed YAML frontmatter", async () => {
    //#given - a handoff.md with malformed YAML frontmatter (missing required field)
    const projectDir = join(TEST_DIR, "malformed-yaml")
    mkdirSync(join(projectDir, ".matrixx"), { recursive: true })
    // Missing required `topics` field — schema validation must fail
    const malformed = [
      "---",
      "frontmatter:",
      "  session_id: ses_e2e_malformed",
      "  timestamp: 2025-01-01T00:00:00.000Z",
      "  git_head:",
      "    sha: abc123",
      "sections:",
      "  user_requests: 'continue'",
      "  goal: 'finish'",
      "  work_completed: []",
      "  current_state: 'in progress'",
      "---",
      "",
      "HANDOFF CONTEXT",
      "===============",
      "",
      "GOAL",
      "----",
      "finish",
      "",
    ].join("\n")
    writeFileSync(getHandoffFilePath(projectDir), malformed, "utf-8")
    const { createHandoffTools } = await import("../../tools/handoff/tools")
    const tools = createHandoffTools(makeCtx(projectDir))
    const context = makeContext("ses_e2e_malformed", projectDir)

    //#when
    const result = await tools.handoff.execute({ action: "read" }, context)

    //#then - leading warning + raw content preserved (forgiving fallback)
    expect(result).toMatch(/^Warning:/)
    expect(result).toContain("failed schema validation")
    expect(result).toContain("session_id: ses_e2e_malformed")
    expect(result).toContain("HANDOFF CONTEXT")
  })
})
