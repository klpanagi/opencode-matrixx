import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import { ContractSchema } from "../../../src/features/bdd/schema"
import { createBddValidateContractTool } from "../../../src/tools/bdd-validate-contract/tools"

// ---------------------------------------------------------------------------
// Fixtures -- use real temp files (no mock.module) to avoid colliding with
// the bdd-create-contract test, which also mocks node:fs.
// ---------------------------------------------------------------------------

const TMP_DIR = path.join(os.tmpdir(), "bdd-validate-contract-tests")
const VALID_CONTRACT_PATH = path.join(TMP_DIR, "valid.contract.json")
const INVALID_CONTRACT_PATH = path.join(TMP_DIR, "invalid.contract.json")
const MALFORMED_JSON_PATH = path.join(TMP_DIR, "malformed.contract.json")
const MISSING_PATH = path.join(TMP_DIR, "does-not-exist.contract.json")

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

beforeAll(async () => {
  await fs.promises.mkdir(TMP_DIR, { recursive: true })
})

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
})

afterEach(() => {
  // Reset -- individual tests write what they need
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bdd_validate_contract tool", () => {
  it("returns success: true and the parsed contract for a valid file", async () => {
    // given
    const validContract = ContractSchema.parse({
      schemaVersion: 1,
      generatedAt: "2026-07-07T12:00:00.000Z",
      sourceFile: "/test/login.feature",
      feature: {
        name: "User Login",
        description: "Login flow",
        tags: ["@REQ-1001"],
        annotations: {},
      },
      scenarios: [
        {
          name: "Successful login",
          tags: ["@happy-path"],
          steps: [
            { keyword: "Given", text: "the user is on the login page" },
            { keyword: "When", text: "the user enters valid credentials" },
            { keyword: "Then", text: "the user is redirected to the dashboard" },
          ],
        },
      ],
      annotations: {
        api: {
          endpoints: [
            { method: "POST", path: "/api/v1/auth/login", description: "Authenticate user" },
          ],
        },
        ui: {
          routes: [{ name: "login", path: "/login" }],
        },
        assumptions: ["User has already registered"],
      },
    })
    await Bun.write(VALID_CONTRACT_PATH, JSON.stringify(validContract, null, 2))
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: VALID_CONTRACT_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
    expect(parsed.contract.schemaVersion).toBe(1)
    expect(parsed.contract.feature.name).toBe("User Login")
    expect(parsed.contract.annotations.api.endpoints[0].method).toBe("POST")
  })

  it("returns success: false with Zod errors for a contract that violates the strict schema", async () => {
    // given -- method is "FETCH" (not in HttpMethodSchema enum) and name has uppercase
    const invalidContract = {
      schemaVersion: 1,
      generatedAt: "2026-07-07T12:00:00.000Z",
      sourceFile: "/test/login.feature",
      feature: {
        name: "User Login",
        tags: [],
        annotations: {},
      },
      scenarios: [],
      annotations: {
        api: {
          endpoints: [
            { method: "FETCH", path: "/api/v1/auth/login" }, // bad enum
          ],
        },
        ui: {
          routes: [{ name: "Login", path: "login" }], // bad kebab + missing leading /
        },
      },
    }
    await Bun.write(INVALID_CONTRACT_PATH, JSON.stringify(invalidContract, null, 2))
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: INVALID_CONTRACT_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.errors).toBeDefined()
    expect(parsed.errors.fieldErrors).toBeDefined()
    // The exact paths depend on zod flatten -- just assert that errors are present
    const allFieldErrors = Object.values(parsed.errors.fieldErrors).flat() as string[]
    expect(allFieldErrors.length).toBeGreaterThan(0)
  })

  it("rejects unknown fields thanks to .strict() on annotation schemas", async () => {
    // given -- an extra "endpointz" key at the api level (typo)
    const contractWithExtra = {
      schemaVersion: 1,
      generatedAt: "2026-07-07T12:00:00.000Z",
      sourceFile: "/test/x.feature",
      feature: { name: "X", tags: [], annotations: {} },
      scenarios: [],
      annotations: {
        api: {
          endpointz: [{ method: "POST", path: "/x" }], // typo -- should fail .strict()
        },
      },
    }
    await Bun.write(INVALID_CONTRACT_PATH, JSON.stringify(contractWithExtra, null, 2))
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: INVALID_CONTRACT_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.errors).toBeDefined()
  })

  it("returns error for malformed JSON", async () => {
    // given
    await Bun.write(MALFORMED_JSON_PATH, "{ this is not json")
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: MALFORMED_JSON_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain("not valid JSON")
  })

  it("returns error for missing file", async () => {
    // given -- MISSING_PATH was never written
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: MISSING_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(false)
    expect(parsed.error).toContain("not found")
  })

  it("returns success: true for the exact contract that bdd_create_contract produces (empty annotations, no # @ syntax leakage)", async () => {
    // given -- the minimal contract shape that bdd_create_contract writes
    const minimalContract = {
      schemaVersion: 1,
      generatedAt: "2026-07-07T12:00:00.000Z",
      sourceFile: "/test/login.feature",
      feature: {
        name: "User Login",
        tags: [],
        annotations: {},
      },
      scenarios: [
        {
          name: "Login",
          tags: [],
          steps: [
            { keyword: "Given", text: "the user is on the login page" },
          ],
        },
      ],
      annotations: {},
    }
    await Bun.write(VALID_CONTRACT_PATH, JSON.stringify(minimalContract, null, 2))
    const tool = createBddValidateContractTool()

    // when
    const result = await tool.execute({ contractPath: VALID_CONTRACT_PATH }, mockContext)
    const parsed = JSON.parse(result)

    // then
    expect(parsed.success).toBe(true)
  })
})

