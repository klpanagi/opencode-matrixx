import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import type { ToolContext } from "@opencode-ai/plugin/tool"

// ---------------------------------------------------------------------------
// Helpers for Bun.spawn / Bun.spawnSync mocking
// ---------------------------------------------------------------------------

function streamFromString(str: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(str))
      c.close()
    },
  })
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start(c) { c.close() } })
}

interface MockSpawnResult {
  exitCode: number
  stdout: string
  stderr: string
}

type SpawnSyncResult = {
  exitCode: number
  stdout: Buffer
  stderr: Buffer
}

// Mock state
let mockFilesExist = new Set<string>()
let mockSpawnResult: MockSpawnResult = { exitCode: 0, stdout: '{"images_found":0,"images":[]}', stderr: "" }
let mockSpawnSyncResults: Array<{ exitCode: number }> = []
let capturedWritePath: string | null = null
let capturedWriteContent: string | null = null
let mockTempDir = "/tmp/mock-matrixx-pdf-extract-abc123"

// ---------------------------------------------------------------------------
// Mock node:fs BEFORE importing module under test
// ---------------------------------------------------------------------------
const mockExistsSync = mock((path: string) => {
  return mockFilesExist.has(path)
})

const mockWriteFileSync = mock((path: string, data: string) => {
  capturedWritePath = path
  capturedWriteContent = data
})

const mockMkdtempSync = mock((_prefix: string) => mockTempDir)

const mockUnlinkSync = mock((_path: string) => {})

const mockRmdirSync = mock((_path: string) => {})

mock.module("node:fs", () => ({
  existsSync: mockExistsSync,
  writeFileSync: mockWriteFileSync,
  mkdtempSync: mockMkdtempSync,
  unlinkSync: mockUnlinkSync,
  rmdirSync: mockRmdirSync,
}))

import { createPdfExtractFiguresTool } from "../../../src/tools/pdf-extract-figures/tools"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockContext: ToolContext = { sessionID: "test-session" } as ToolContext

type AnyRecord = Record<string, unknown>

const SAMPLE_VALID_PDF = "/path/to/document.pdf"
const SAMPLE_OUTPUT_DIR = "/tmp/figures"

interface Spawnable {
  exited: Promise<number>
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
}

function makeSpawnable(result: MockSpawnResult): Spawnable {
  return {
    exited: Promise.resolve(result.exitCode),
    stdout: streamFromString(result.stdout),
    stderr: streamFromString(result.stderr),
  }
}

function makeSpawnSyncResult(exitCode: number): SpawnSyncResult {
  return {
    exitCode,
    stdout: Buffer.from(""),
    stderr: Buffer.from(""),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore()
})

describe("pdf_extract_figures tool", () => {
  beforeEach(() => {
    capturedWritePath = null
    capturedWriteContent = null
    mockFilesExist = new Set([SAMPLE_VALID_PDF])
    mockSpawnResult = { exitCode: 0, stdout: '{"images_found":0,"images":[]}', stderr: "" }
    mockSpawnSyncResults = [{ exitCode: 0 }, { exitCode: 0 }]
  })

  // ── Factory ─────────────────────────────────────────────────────────────

  describe("factory", () => {
    test("creates tool with correct name", () => {
      const tools = createPdfExtractFiguresTool()
      expect(tools).toHaveProperty("pdf_extract_figures")
    })
  })

  // ── Metadata ────────────────────────────────────────────────────────────

  describe("metadata", () => {
    test("description mentions PDF and image extraction", () => {
      const tools = createPdfExtractFiguresTool()
      const desc = tools.pdf_extract_figures.description.toLowerCase()
      expect(desc).toContain("pdf")
      expect(desc).toContain("image")
      expect(desc).toContain("extract")
    })

    test("file_path argument is required", () => {
      const tools = createPdfExtractFiguresTool()
      const args = tools.pdf_extract_figures.args as AnyRecord
      expect(args).toHaveProperty("file_path")
    })

    test("output_dir argument is optional", () => {
      const tools = createPdfExtractFiguresTool()
      const args = tools.pdf_extract_figures.args as AnyRecord
      expect(args).toHaveProperty("output_dir")
    })
  })

  // ── Argument validation ─────────────────────────────────────────────────

  describe("argument validation", () => {
    test("missing file_path returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        {},
        mockContext,
      )
      expect(result).toContain("Error")
      expect(result).toContain("file_path")
    })

    test("empty file_path returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: "" },
        mockContext,
      )
      expect(result).toContain("Error")
      expect(result).toContain("file_path")
    })

    test("non-existent file returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: "/nonexistent/file.pdf" },
        mockContext,
      )
      expect(result).toContain("Error")
      expect(result).toContain("not found")
    })

    test("non-PDF extension returns error", async () => {
      mockFilesExist.add("/path/to/file.txt")
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: "/path/to/file.txt" },
        mockContext,
      )
      expect(result).toContain("Error")
      expect(result).toContain("PDF")
    })

    test("invalid page number returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, page: 0 },
        mockContext,
      )
      expect(result).toContain("Error")
    })

    test("negative min_width returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, min_width: -1 },
        mockContext,
      )
      expect(result).toContain("Error")
    })

    test("negative min_height returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, min_height: -5 },
        mockContext,
      )
      expect(result).toContain("Error")
    })

    test("negative min_area returns error", async () => {
      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, min_area: -100 },
        mockContext,
      )
      expect(result).toContain("Error")
    })
  })

  // ── Python availability check ───────────────────────────────────────────

  describe("python availability check", () => {
    test("returns error when Bun.spawnSync throws", async () => {
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => {
        throw new Error("python3 not found")
      }) as any

      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF },
        mockContext,
      )

      expect(result).toContain("Python3")
      expect(result).toContain("not available")

      Bun.spawnSync = origSpawnSync
    })

    test("returns error when python3 exits non-zero", async () => {
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("command not found"),
      })) as any

      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF },
        mockContext,
      )

      expect(result).toContain("Python3")

      Bun.spawnSync = origSpawnSync
    })

    test("returns error when PyMuPDF is not installed", async () => {
      const origSpawnSync = Bun.spawnSync
      let callCount = 0

      Bun.spawnSync = mock(() => {
        callCount++
        // First call: python3 --version succeeds
        if (callCount === 1) {
          return { exitCode: 0, stdout: Buffer.from("Python 3.11"), stderr: Buffer.from("") }
        }
        // Second call: import fitz fails
        return { exitCode: 1, stdout: Buffer.from(""), stderr: Buffer.from("ModuleNotFoundError: No module named 'fitz'") }
      }) as any

      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF },
        mockContext,
      )

      expect(result).toContain("PyMuPDF")
      expect(result).toContain("pip install")

      Bun.spawnSync = origSpawnSync
    })
  })

  // ── Successful execution ────────────────────────────────────────────────

  describe("execution", () => {
    test("returns JSON when extraction succeeds", async () => {
      const origSpawn = Bun.spawn
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })) as any

      const expectedJson = JSON.stringify({
        pdf_path: SAMPLE_VALID_PDF,
        page_count: 2,
        images_found: 2,
        images: [
          { xref: 5, page: 1, ext: "png", width: 100, height: 80, file_size: 305, bbox: "75,100,225,220", area: 18000 },
          { xref: 5, page: 2, ext: "png", width: 100, height: 80, file_size: 305, bbox: "75,100,225,220", area: 18000 },
        ],
      })

      Bun.spawn = mock(() => makeSpawnable({ exitCode: 0, stdout: expectedJson, stderr: "" })) as any

      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF },
        mockContext,
      )

      const parsed = JSON.parse(result)
      expect(parsed).toHaveProperty("pdf_path")
      expect(parsed).toHaveProperty("page_count")
      expect(parsed).toHaveProperty("images_found")
      expect(parsed).toHaveProperty("images")
      expect(parsed.images_found).toBe(2)

      Bun.spawn = origSpawn
      Bun.spawnSync = origSpawnSync
    })

    test("extraction failure returns error with stderr", async () => {
      const origSpawn = Bun.spawn
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })) as any

      Bun.spawn = mock(() =>
        makeSpawnable({ exitCode: 1, stdout: "", stderr: "PDF file is corrupted" }),
      ) as any

      const tools = createPdfExtractFiguresTool()
      const result = await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF },
        mockContext,
      )

      expect(result).toContain("Error")
      expect(result).toContain("exit code")
      expect(result).toContain("PDF file is corrupted")

      Bun.spawn = origSpawn
      Bun.spawnSync = origSpawnSync
    })

    test("passes output_dir to python script", async () => {
      const origSpawn = Bun.spawn
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })) as any

      let capturedArgs: string[] = []

      Bun.spawn = mock((cmd: string[], _opts?: any) => {
        capturedArgs = cmd
        return makeSpawnable({
          exitCode: 0,
          stdout: JSON.stringify({ images_found: 0, images: [] }),
          stderr: "",
        })
      }) as any

      const tools = createPdfExtractFiguresTool()
      await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, output_dir: SAMPLE_OUTPUT_DIR },
        mockContext,
      )

      // Verify the python3 script was called with correct args
      expect(capturedArgs[0]).toBe("python3")
      expect(capturedArgs.length).toBe(3) // python3, script, payload

      // Parse the JSON payload to verify output_dir is passed
      const payload = JSON.parse(capturedArgs[2])
      expect(payload).toHaveProperty("pdf_path", SAMPLE_VALID_PDF)
      expect(payload).toHaveProperty("output_dir", SAMPLE_OUTPUT_DIR)

      Bun.spawn = origSpawn
      Bun.spawnSync = origSpawnSync
    })

    test("passes page filter to python script", async () => {
      const origSpawn = Bun.spawn
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })) as any

      let capturedPayload: string = ""

      Bun.spawn = mock((cmd: string[], _opts?: any) => {
        capturedPayload = cmd[2]
        return makeSpawnable({
          exitCode: 0,
          stdout: JSON.stringify({ images_found: 0, images: [] }),
          stderr: "",
        })
      }) as any

      const tools = createPdfExtractFiguresTool()
      await tools.pdf_extract_figures.execute(
        { file_path: SAMPLE_VALID_PDF, page: 3 },
        mockContext,
      )

      const payload = JSON.parse(capturedPayload)
      expect(payload).toHaveProperty("page", 3)

      Bun.spawn = origSpawn
      Bun.spawnSync = origSpawnSync
    })

    test("passes filter parameters (min_width, min_height, min_area, json_only)", async () => {
      const origSpawn = Bun.spawn
      const origSpawnSync = Bun.spawnSync

      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      })) as any

      let capturedPayload: string = ""

      Bun.spawn = mock((cmd: string[], _opts?: any) => {
        capturedPayload = cmd[2]
        return makeSpawnable({
          exitCode: 0,
          stdout: JSON.stringify({ images_found: 0, images: [] }),
          stderr: "",
        })
      }) as any

      const tools = createPdfExtractFiguresTool()
      await tools.pdf_extract_figures.execute(
        {
          file_path: SAMPLE_VALID_PDF,
          min_width: 100,
          min_height: 50,
          min_area: 5000,
          json_only: true,
        },
        mockContext,
      )

      const payload = JSON.parse(capturedPayload)
      expect(payload).toHaveProperty("min_width", 100)
      expect(payload).toHaveProperty("min_height", 50)
      expect(payload).toHaveProperty("min_area", 5000)
      expect(payload).toHaveProperty("json_only", true)

      Bun.spawn = origSpawn
      Bun.spawnSync = origSpawnSync
    })
  })
})
