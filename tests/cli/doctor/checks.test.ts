import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"

// ---------------------------------------------------------------------------
// Mock state
// ---------------------------------------------------------------------------

let mockBunSpawnSyncCalls: Array<{ cmd: string[] }> = []
let mockBunSpawnSyncResults: Array<{ exitCode: number; stdout: string; stderr: string }> = []
let mockFiles: Set<string>
let mockFileContents: Map<string, string>

// ---------------------------------------------------------------------------
// Mock Bun.spawnSync (default: fail)
// ---------------------------------------------------------------------------
const origSpawnSync = Bun.spawnSync

function resetMocks(): void {
  mockBunSpawnSyncCalls = []
  mockBunSpawnSyncResults = []
  mockFiles = new Set()
  mockFileContents = new Map()
}

beforeEach(() => {
  resetMocks()
  Bun.spawnSync = mock((cmd: string[], _opts?: any) => {
    mockBunSpawnSyncCalls.push({ cmd })
    const result = mockBunSpawnSyncResults.shift() ?? { exitCode: 1, stdout: "", stderr: "" }
    return {
      exitCode: result.exitCode,
      stdout: Buffer.from(result.stdout),
      stderr: Buffer.from(result.stderr),
    }
  }) as any
})

afterAll(() => {
  Bun.spawnSync = origSpawnSync
  mock.restore()
})

// ---------------------------------------------------------------------------
// Mock node:fs — self-contained, no fallback to real fs (prevents recursion)
// ---------------------------------------------------------------------------

const mockExistsSync = mock((path: string) => mockFiles.has(path))

const mockReadFileSync = mock((path: string, _encoding?: any) => {
  if (!mockFiles.has(path)) {
    const err = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException
    err.code = "ENOENT"
    throw err
  }
  return mockFileContents.get(path) ?? ""
})

mock.module("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { homedir } from "node:os"
import { join } from "node:path"

import { pluginInstallationCheck } from "../../../src/cli/doctor/checks/plugin"
import { configValidationCheck } from "../../../src/cli/doctor/checks/config"
import { authCheck } from "../../../src/cli/doctor/checks/auth"
import { runtimeDepsCheck } from "../../../src/cli/doctor/checks/runtime"
import { optionalToolsCheck } from "../../../src/cli/doctor/checks/optional"
import { ALL_CHECKS, getChecksByCategory, getCategories } from "../../../src/cli/doctor/checks"

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("check registry", () => {
  test("ALL_CHECKS has 5 entries", () => {
    expect(ALL_CHECKS.length).toBe(5)
  })

  test("getCategories returns 5 unique categories", () => {
    const cats = getCategories()
    expect(cats.length).toBe(5)
    expect(cats).toContain("installation")
    expect(cats).toContain("configuration")
    expect(cats).toContain("authentication")
    expect(cats).toContain("dependencies")
    expect(cats).toContain("tools")
  })

  test("getChecksByCategory filters correctly", () => {
    const auth = getChecksByCategory("authentication")
    expect(auth.length).toBe(1)
    expect(auth[0].name).toBe("authentication")
  })

  test("every check has name, category, check function", () => {
    for (const check of ALL_CHECKS) {
      expect(check).toHaveProperty("name")
      expect(check).toHaveProperty("category")
      expect(typeof check.check).toBe("function")
    }
  })

  test("check returns proper result shape", async () => {
    for (const check of ALL_CHECKS) {
      const result = await Promise.resolve(check.check())
      expect(result).toHaveProperty("name")
      expect(result).toHaveProperty("status")
      expect(result).toHaveProperty("message")
      expect(["pass", "warn", "fail"]).toContain(result.status)
    }
  })
})

describe("pluginInstallationCheck", () => {
  test("fails when opencode CLI not found (spawnSync throws)", async () => {
    Bun.spawnSync = mock(() => {
      throw new Error("not found")
    }) as any

    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("OpenCode CLI")
  })

  test("fails when opencode version check fails (exit code non-zero)", async () => {
    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("OpenCode CLI")
  })

  test("warns when opencode version available but config not found", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "opencode 1.0.155", stderr: "" },
    ]

    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("opencode.json not found")
  })

  test("passes when opencode CLI and plugin registered", async () => {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    mockFiles.add(configPath)
    mockFileContents.set(configPath, JSON.stringify({ plugin: ["opencode-matrixx"] }))
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "opencode 1.0.155", stderr: "" },
    ]

    const result = await pluginInstallationCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("plugin registered")
  })
})

describe("configValidationCheck", () => {
  test("warns when no config file found", async () => {
    const result = await configValidationCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("No matrixx configuration")
  })

  test("passes when valid config found", async () => {
    mockFiles.add(join(process.cwd(), "matrixx.json"))
    mockFileContents.set(join(process.cwd(), "matrixx.json"), JSON.stringify({ agents: {} }))

    const result = await configValidationCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("valid")
  })

  test("fails when config has invalid JSON", async () => {
    mockFiles.add(join(process.cwd(), "matrixx.json"))
    mockFileContents.set(join(process.cwd(), "matrixx.json"), "{ invalid json")

    const result = await configValidationCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("Invalid JSON")
  })
})

describe("authCheck", () => {
  test("fails when no provider configured and no config file", async () => {
    const result = await authCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("No API providers")
  })

  test("warns when some providers configured via opencode.json", async () => {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json")
    mockFiles.add(configPath)
    mockFileContents.set(
      configPath,
      JSON.stringify({
        plugins: ["opencode-matrixx"],
        provider: "anthropic",
        apiKey: "sk-ant-xxx",
      }),
    )

    const result = await authCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("Configured")
  })
})

describe("runtimeDepsCheck", () => {
  test("detects missing runtimes (default mock fails)", async () => {
    const result = await runtimeDepsCheck.check()
    expect(result.status).toBe("fail")
    expect(result.message).toContain("missing")
  })

  test("reports all present when spawn succeeds", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "Bun 1.2.3", stderr: "" },
      { exitCode: 0, stdout: "v22.0.0", stderr: "" },
      { exitCode: 0, stdout: "git version 2.45.0", stderr: "" },
      { exitCode: 0, stdout: "Python 3.11.0", stderr: "" },
    ]

    const result = await runtimeDepsCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("Bun")
    expect(result.message).toContain("Node.js")
    expect(result.message).toContain("Git")
    expect(result.message).toContain("Python3")
  })
})

describe("optionalToolsCheck", () => {
  test("reports tools as missing (default mock fails)", async () => {
    const result = await optionalToolsCheck.check()
    expect(result.status).toBe("warn")
    expect(result.message).toContain("Missing")
  })

  test("reports all tools present when queued", async () => {
    mockBunSpawnSyncResults = [
      { exitCode: 0, stdout: "Python 3.11.0", stderr: "" },
      { exitCode: 0, stdout: "sg 0.40.0", stderr: "" },
      { exitCode: 0, stdout: "8.18.0", stderr: "" },
      { exitCode: 0, stdout: "1.24.0", stderr: "" },
      { exitCode: 0, stdout: "1.48.0", stderr: "" },
    ]

    const result = await optionalToolsCheck.check()
    expect(result.status).toBe("pass")
    expect(result.message).toContain("ast-grep")
    expect(result.message).toContain("PyMuPDF")
  })
})
