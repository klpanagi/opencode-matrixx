import { afterAll, describe, expect, it, mock } from "bun:test"
import * as fs from "node:fs"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { createBddParseGherkinTool } from "../../../src/tools/bdd-parse-gherkin/tools"

const _originalReadFileSync = fs.readFileSync.bind(fs)

// Fixture content constants
const VALID_FEATURE = `Feature: User Login
  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user should be redirected to the dashboard`

const EMPTY_FEATURE = ""

const MALFORMED_FEATURE = `Some random text that is not Gherkin
---
not a feature file`

mock.module("node:fs", () => ({
  ...fs,
  readFileSync: (path: string, _encoding?: string) => {
    if (path === "/test/valid.feature") return VALID_FEATURE
    if (path === "/test/empty.feature") return EMPTY_FEATURE
    if (path === "/test/malformed.feature") return MALFORMED_FEATURE
    // Non-existent file
    const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
    err.code = "ENOENT"
    throw err
  },
}))

afterAll(() => {
  mock.restore()
})

const mockContext: ToolContext = {
  sessionID: "s",
  messageID: "m",
  agent: "bdd-contract",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

describe("bdd_parse_gherkin tool", () => {
  it("parses a valid .feature file and returns JSON AST", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/valid.feature" }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.data).toBeDefined()
    expect(parsed.data.feature).toBeDefined()
    expect(parsed.data.feature.keyword).toBe("Feature")
    expect(parsed.data.feature.name).toBe("User Login")
    expect(parsed.data.feature.children).toBeInstanceOf(Array)
    expect(parsed.data.feature.children.length).toBeGreaterThanOrEqual(1)
  })

  it("handles non-existent file and returns structured error", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/nonexistent.feature" }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.error).toBeDefined()
    expect(parsed.error).toContain("ENOENT")
  })

  it("handles malformed Gherkin content gracefully", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/malformed.feature" }, mockContext)
    const parsed = JSON.parse(result)

    // then — should return structured error or gracefully degrade
    expect(parsed.success).toBe(false)
    expect(parsed.error).toBeDefined()
  })

  it("includes location info when includeSourceMap is true", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/valid.feature", includeSourceMap: true }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.data.feature.location).toBeDefined()
    expect(parsed.data.feature.location.line).toBe(1)
  })

  it("omits location info by default (includeSourceMap: false)", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/valid.feature" }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.data.feature.location).toBeUndefined()
  })

  it("handles empty file and returns AST with empty feature", async () => {
    // given
    const tool = createBddParseGherkinTool()

    // when
    const result = await tool.execute({ filePath: "/test/empty.feature" }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.data).toBeDefined()
    expect(parsed.data.feature).toBeDefined()
    expect(parsed.data.feature.keyword).toBe("Feature")
    expect(parsed.data.feature.children).toBeInstanceOf(Array)
    expect(parsed.data.feature.children.length).toBe(0)
  })
})
