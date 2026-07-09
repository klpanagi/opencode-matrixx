import { afterAll, afterEach, describe, expect, it, mock } from "bun:test"
import crypto from "node:crypto"
import * as fs from "node:fs"
import { generateMessages } from "@cucumber/gherkin"
import { SourceMediaType } from "@cucumber/messages"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { ContractSchema } from "../../features/bdd/schema"
import { createBddCreateContractTool } from "./tools"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseGherkin(content: string): Record<string, unknown> | undefined {
  const envelopes = generateMessages(
    content,
    "test.feature",
    SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    {
      includeGherkinDocument: true,
      includePickles: true,
      newId: () => crypto.randomUUID(),
    },
  )
  return envelopes.find((e) => e.gherkinDocument)?.gherkinDocument as
    | Record<string, unknown>
    | undefined
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_FEATURE = `Feature: User Login
  As a user
  I want to log in

  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user should be redirected to the dashboard`

const DATA_TABLE_FEATURE = `Feature: Checkout
  Scenario: Apply discount
    Given the user is on the payment step
    When the user applies discount code "SAVE20"
    Then the following adjustments should be applied:
      | Item   | Price   | Discount |
      | Widget | $49.99  | 20%      |
      | Gadget | $29.99  | 10%      |`

const OUTLINE_FEATURE = `Feature: Shipping
  Scenario Outline: Select shipping method
    Given the user is on the shipping step
    When the user selects "<method>"
    Then the cost should be "<cost>"

    Examples:
      | method   | cost   |
      | standard | $5.99  |
      | express  | $12.99 |`

const RULES_FEATURE = `Feature: Pagination

  Rule: Standard pagination
    Scenario: First page
      Given the endpoint is available
      When the client requests the first page
      Then the response should contain items

  Rule: Filtering
    Scenario: Filtered results
      Given the endpoint is available
      When the client filters by category
      Then the response should be filtered`

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

const existingFiles = new Set<string>()
const writtenFiles = new Map<string, string>()

const _originalFs = { ...fs }

mock.module("node:fs", () => ({
  ..._originalFs,
  existsSync: (p: string) => existingFiles.has(p),
  writeFileSync: (p: string, data: string) => {
    writtenFiles.set(p, data)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bdd_create_contract tool", () => {
  afterEach(() => {
    existingFiles.clear()
    writtenFiles.clear()
  })

  it("produces valid Contract JSON from valid AST and annotations", async () => {
    // given
    const ast = parseGherkin(VALID_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.outputPath).toBe("/test/login.feature.contract.json")
    expect(writtenFiles.has("/test/login.feature.contract.json")).toBe(true)

    const contractStr = writtenFiles.get("/test/login.feature.contract.json") || "{}"
    const contractJson = JSON.parse(contractStr)
    const validation = ContractSchema.safeParse(contractJson)
    expect(validation.success).toBe(true)
    expect(contractJson.annotations).toEqual({})
  })

  it("leaves annotations empty for agent enrichment (no # @ comments parsed)", async () => {
    // given
    const ast = parseGherkin(VALID_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
        force: true,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    const contractStr = writtenFiles.get("/test/login.feature.contract.json") || "{}"
    const contractJson = JSON.parse(contractStr)
    expect(contractJson.annotations).toEqual({})
  })

  it("returns error when output file exists and force is false", async () => {
    // given
    existingFiles.add("/test/login.feature.contract.json")
    const ast = parseGherkin(VALID_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain("already exists")
  })

  it("overwrites existing file when force is true", async () => {
    // given
    existingFiles.add("/test/login.feature.contract.json")
    const ast = parseGherkin(VALID_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
        force: true,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.outputPath).toBe("/test/login.feature.contract.json")
    expect(writtenFiles.has("/test/login.feature.contract.json")).toBe(true)
  })

  it("returns error for malformed AST JSON", async () => {
    // given
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst: "not valid json",
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.error).toBeDefined()
  })

  it("preserves data table in contract steps", async () => {
    // given
    const ast = parseGherkin(DATA_TABLE_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/checkout.feature",
        sourceText: DATA_TABLE_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    const contractStr = writtenFiles.get("/test/checkout.feature.contract.json") || "{}"
    const contractJson = JSON.parse(contractStr)
    const thenStep = contractJson.scenarios[0].steps.find(
      (s: Record<string, unknown>) => s.keyword === "Then",
    )
    expect(thenStep.dataTable).toBeDefined()
    expect(thenStep.dataTable.length).toBe(2)
    expect(thenStep.dataTable[0]).toEqual({
      Item: "Widget",
      Price: "$49.99",
      Discount: "20%",
    })
  })

  it("preserves scenario outline examples in contract", async () => {
    // given
    const ast = parseGherkin(OUTLINE_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/outline.feature",
        sourceText: OUTLINE_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    const contractStr = writtenFiles.get("/test/outline.feature.contract.json") || "{}"
    const contractJson = JSON.parse(contractStr)
    expect(contractJson.scenarios[0].examples).toBeDefined()
    expect(contractJson.scenarios[0].examples).toEqual([
      { method: "standard", cost: "$5.99" },
      { method: "express", cost: "$12.99" },
    ])
  })

  it("extracts rules into top-level rules array", async () => {
    // given
    const ast = parseGherkin(RULES_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/rules.feature",
        sourceText: RULES_FEATURE,
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    const contractStr = writtenFiles.get("/test/rules.feature.contract.json") || "{}"
    const contractJson = JSON.parse(contractStr)
    expect(contractJson.rules).toBeDefined()
    expect(contractJson.rules.length).toBe(2)
    expect(contractJson.rules[0].name).toBe("Standard pagination")
    expect(contractJson.rules[1].name).toBe("Filtering")
    expect(contractJson.rules[0].scenarios.length).toBe(1)
  })

  it("uses custom outputPath when provided", async () => {
    // given
    const ast = parseGherkin(VALID_FEATURE)
    const parsedAst = JSON.stringify({ success: true, data: ast })
    const tool = createBddCreateContractTool()

    // when
    const result = await tool.execute(
      {
        parsedAst,
        sourceFile: "/test/login.feature",
        sourceText: VALID_FEATURE,
        outputPath: "/custom/output/contract.json",
      },
      mockContext,
    )
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.outputPath).toBe("/custom/output/contract.json")
    expect(writtenFiles.has("/custom/output/contract.json")).toBe(true)
  })
})

