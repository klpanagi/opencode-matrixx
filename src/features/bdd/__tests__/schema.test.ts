import { describe, expect, it } from "bun:test"
import type { Contract } from "../schema"
import { ContractSchema } from "../schema"

//#given a minimal valid contract fixture
function makeMinimalContract(): Contract {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-15T10:30:00.000Z",
    sourceFile: "features/login.feature",
    feature: {
      name: "User Login",
      tags: ["auth"],
      annotations: {},
    },
    scenarios: [
      {
        name: "Successful login",
        tags: ["smoke"],
        steps: [
          { keyword: "Given", text: "a registered user" },
          { keyword: "When", text: "they submit valid credentials" },
          { keyword: "Then", text: "they are redirected to the dashboard" },
        ],
      },
    ],
    annotations: {},
  }
}

describe("ContractSchema", () => {
  //#given valid minimal contract
  //#when parsed through ContractSchema
  //#then succeeds
  it("accepts a valid minimal contract", () => {
    const result = ContractSchema.safeParse(makeMinimalContract())
    expect(result.success).toBe(true)
  })

  //#given a contract missing schemaVersion
  //#when parsed through ContractSchema
  //#then fails with schemaVersion error
  it("rejects contract missing schemaVersion", () => {
    const invalid = { ...makeMinimalContract() }
    // @ts-expect-error testing missing required field
    delete invalid.schemaVersion
    const result = ContractSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  //#given a contract with schemaVersion: 2
  //#when parsed through ContractSchema
  //#then fails — only literal 1 is accepted
  it("rejects schemaVersion !== 1", () => {
    const invalid = { ...makeMinimalContract(), schemaVersion: 2 }
    const result = ContractSchema.safeParse(invalid)
    expect(result.success).toBe(false)
  })

  //#given a contract with empty annotations object
  //#when parsed through ContractSchema
  //#then succeeds — empty annotations are valid
  it("accepts empty annotations object", () => {
    const contract = makeMinimalContract()
    contract.annotations = {}
    contract.feature.annotations = {}
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
  })

  //#given a scenario with a dataTable
  //#when parsed through ContractSchema
  //#then succeeds with dataTable preserved
  it("parses scenario with data table", () => {
    const contract = makeMinimalContract()
    contract.scenarios[0].steps = [
      {
        keyword: "Given",
        text: "the following users exist",
        dataTable: [
          { username: "alice", role: "admin" },
          { username: "bob", role: "viewer" },
        ],
      },
      { keyword: "Then", text: "they should be found" },
    ]
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scenarios[0].steps[0].dataTable).toHaveLength(2)
    }
  })

  //#given a scenario with a docString step
  //#when parsed through ContractSchema
  //#then succeeds with docString preserved
  it("parses scenario with doc string", () => {
    const contract = makeMinimalContract()
    contract.scenarios[0].steps = [
      {
        keyword: "Given",
        text: "a config file with content",
        docString: 'key: "value"\ndebug: true',
      },
      { keyword: "Then", text: "it should load" },
    ]
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scenarios[0].steps[0].docString).toBe(
        'key: "value"\ndebug: true',
      )
    }
  })

  //#given a scenario with examples (Scenario Outline)
  //#when parsed through ContractSchema
  //#then succeeds with examples preserved
  it("parses scenario outline with examples", () => {
    const contract = makeMinimalContract()
    contract.scenarios[0].examples = [
      { username: "alice", expected: "admin" },
      { username: "bob", expected: "viewer" },
    ]
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scenarios[0].examples).toHaveLength(2)
    }
  })

  //#given a contract with a background section
  //#when parsed through ContractSchema
  //#then succeeds with background preserved
  it("parses contract with background", () => {
    const contract = makeMinimalContract()
    contract.background = {
      steps: [{ keyword: "Given", text: "the server is running" }],
    }
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.background?.steps).toHaveLength(1)
    }
  })

  //#given a contract with rules array
  //#when parsed through ContractSchema
  //#then succeeds with rules preserved
  it("parses contract with rules", () => {
    const contract = makeMinimalContract()
    contract.rules = [
      {
        name: "Rate Limiting",
        description: "API rate limits apply",
        scenarios: [
          {
            name: "Exceeds rate limit",
            tags: [],
            steps: [
              { keyword: "When", text: "user sends 100 requests" },
              { keyword: "Then", text: "request is rejected" },
            ],
          },
        ],
      },
    ]
    const result = ContractSchema.safeParse(contract)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rules).toHaveLength(1)
      expect(result.data.rules?.[0].name).toBe("Rate Limiting")
    }
  })
})
