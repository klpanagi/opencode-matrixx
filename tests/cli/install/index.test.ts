import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { join } from "node:path"
import { homedir } from "node:os"

// ---------------------------------------------------------------------------
// Mock state for node:fs
// ---------------------------------------------------------------------------
let capturedWritePath: string | null = null
let capturedWriteData: string | null = null
let mockFiles = new Set<string>()
let mockFileContents = new Map<string, string>()

const mockExistsSync = mock((path: string) => mockFiles.has(path))
const mockMkdirSync = mock((_path: string, _opts?: any) => {})
const mockWriteFileSync = mock((path: string, data: string) => {
  capturedWritePath = path
  capturedWriteData = data
  mockFiles.add(path)
  mockFileContents.set(path, data)
})
const mockReadFileSync = mock((path: string, _encoding?: any) => {
  return mockFileContents.get(path) ?? ""
})

mock.module("node:fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
}))

// Import after mocks
import { executeInstall } from "../../../src/cli/install"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CONFIG_DIR = join(homedir(), ".config", "opencode")
const CONFIG_PATH = join(CONFIG_DIR, "opencode.json")
const CWD = process.cwd()

function resetState(): void {
  capturedWritePath = null
  capturedWriteData = null
  mockFiles = new Set()
  mockFileContents = new Map()
}

beforeEach(() => {
  resetState()
})

afterAll(() => {
  mock.restore()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeInstall", () => {
  test("says already registered when plugin exists in config", async () => {
    mockFiles.add(CONFIG_PATH)
    mockFileContents.set(
      CONFIG_PATH,
      JSON.stringify({ plugin: ["opencode-matrixx"] }),
    )

    const result = await executeInstall({ noTui: true })
    expect(result).toContain("already registered")
    expect(capturedWriteData).toBeNull()
  })

  test("creates config directory and writes plugin entry when no config exists", async () => {
    const result = await executeInstall({ noTui: true })

    expect(result).toContain("Install Complete")
    expect(capturedWritePath).toBe(CONFIG_PATH)
    expect(capturedWriteData).not.toBeNull()

    const config = JSON.parse(capturedWriteData!)
    expect(config.plugin).toBeDefined()
    expect(Array.isArray(config.plugin)).toBe(true)
    expect(config.plugin.length).toBe(1)
  })

  test("appends to existing plugin array when config exists", async () => {
    // Pre-populate with existing plugin
    mockFiles.add(CONFIG_PATH)
    mockFileContents.set(
      CONFIG_PATH,
      JSON.stringify({ plugin: ["other-plugin"] }),
    )

    const result = await executeInstall({ noTui: true })
    expect(result).toContain("Install Complete")

    const config = JSON.parse(capturedWriteData!)
    expect(config.plugin.length).toBe(2)
    expect(config.plugin[0]).toBe("other-plugin")
  })

  test("creates plugin array when config has no plugin field", async () => {
    mockFiles.add(CONFIG_PATH)
    mockFileContents.set(CONFIG_PATH, JSON.stringify({ someKey: "value" }))

    const result = await executeInstall({ noTui: true })
    expect(result).toContain("Install Complete")

    const config = JSON.parse(capturedWriteData!)
    expect(config.plugin).toBeDefined()
    expect(config.plugin.length).toBe(1)
  })

  test("subscription flags appear in output", async () => {
    const result = await executeInstall({
      noTui: true,
      claude: "max20",
      openai: "yes",
      gemini: "no",
      copilot: "yes",
    })

    expect(result).toContain("Claude")
    expect(result).toContain("max20")
    expect(result).toContain("OpenAI")
    expect(result).toContain("yes")
    expect(result).toContain("Copilot")
  })

  test("shows next steps in output", async () => {
    const result = await executeInstall({ noTui: true })
    expect(result).toContain("Next steps")
    expect(result).toContain("opencode auth login")
    expect(result).toContain("doctor")
  })
})
