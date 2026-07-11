import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  archiveHandoffFile,
  ensureHandoffDir,
  getHandoffConsumedFilePath,
  getHandoffFilePath,
  handoffFileExists,
  readHandoffFile,
  writeHandoffFile,
} from "../../../src/features/handoff/storage"

describe("handoff/storage", () => {
  const TEST_DIR = join(tmpdir(), `handoff-storage-test-${Date.now()}`)
  const MATRIX_DIR = join(TEST_DIR, ".matrixx")

  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
    if (!existsSync(MATRIX_DIR)) {
      mkdirSync(MATRIX_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe("getHandoffFilePath", () => {
    test("returns path to .matrixx/handoff.md", () => {
      //#given - a directory path
      const dir = "/some/project"

      //#when
      const result = getHandoffFilePath(dir)

      //#then
      expect(result).toBe("/some/project/.matrixx/handoff.md")
    })
  })

  describe("getHandoffConsumedFilePath", () => {
    test("returns path to .matrixx/handoff.consumed.md", () => {
      //#given - a directory path
      const dir = "/some/project"

      //#when
      const result = getHandoffConsumedFilePath(dir)

      //#then
      expect(result).toBe("/some/project/.matrixx/handoff.consumed.md")
    })
  })

  describe("handoffFileExists", () => {
    test("returns true when .matrixx/handoff.md exists", () => {
      //#given - handoff.md exists
      const handoffPath = join(MATRIX_DIR, "handoff.md")
      writeFileSync(handoffPath, "some content")

      //#when
      const result = handoffFileExists(TEST_DIR)

      //#then
      expect(result).toBe(true)
    })

    test("returns false when file does not exist", () => {
      //#given - .matrixx dir exists but no handoff.md

      //#when
      const result = handoffFileExists(TEST_DIR)

      //#then
      expect(result).toBe(false)
    })

    test("returns false when .matrixx/ dir does not exist", () => {
      //#given - a directory with no .matrixx subdirectory
      const emptyDir = join(tmpdir(), `handoff-empty-${Date.now()}`)
      mkdirSync(emptyDir, { recursive: true })

      //#when
      const result = handoffFileExists(emptyDir)

      //#then
      expect(result).toBe(false)

      rmSync(emptyDir, { recursive: true, force: true })
    })
  })

  describe("readHandoffFile", () => {
    test("returns file content when file exists", () => {
      //#given - handoff.md with content
      const content = "HANDOFF CONTEXT\n===============\nsome context here"
      writeFileSync(join(MATRIX_DIR, "handoff.md"), content)

      //#when
      const result = readHandoffFile(TEST_DIR)

      //#then
      expect(result).toBe(content)
    })

    test("returns empty string when file is empty", () => {
      //#given - handoff.md with empty content
      writeFileSync(join(MATRIX_DIR, "handoff.md"), "")

      //#when
      const result = readHandoffFile(TEST_DIR)

      //#then
      expect(result).toBe("")
    })

    test("returns null when file does not exist", () => {
      //#given - no handoff.md file

      //#when
      const result = readHandoffFile(TEST_DIR)

      //#then
      expect(result).toBeNull()
    })

    test("returns null when .matrixx/ dir does not exist", () => {
      //#given - a directory with no .matrixx subdirectory
      const emptyDir = join(tmpdir(), `handoff-nodir-${Date.now()}`)
      mkdirSync(emptyDir, { recursive: true })

      //#when
      const result = readHandoffFile(emptyDir)

      //#then
      expect(result).toBeNull()

      rmSync(emptyDir, { recursive: true, force: true })
    })
  })

  describe("archiveHandoffFile", () => {
    test("renames handoff.md to handoff.consumed.md and returns true", () => {
      //#given - handoff.md exists with content
      const content = "handoff content"
      writeFileSync(join(MATRIX_DIR, "handoff.md"), content)

      //#when
      const result = archiveHandoffFile(TEST_DIR)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(MATRIX_DIR, "handoff.md"))).toBe(false)
      expect(existsSync(join(MATRIX_DIR, "handoff.consumed.md"))).toBe(true)
      expect(readFileSync(join(MATRIX_DIR, "handoff.consumed.md"), "utf-8")).toBe(content)
    })

    test("returns false when handoff.md does not exist", () => {
      //#given - no handoff.md file

      //#when
      const result = archiveHandoffFile(TEST_DIR)

      //#then
      expect(result).toBe(false)
    })

    test("overwrites existing handoff.consumed.md", () => {
      //#given - both handoff.md and handoff.consumed.md exist
      writeFileSync(join(MATRIX_DIR, "handoff.consumed.md"), "old content")
      writeFileSync(join(MATRIX_DIR, "handoff.md"), "new content")

      //#when
      const result = archiveHandoffFile(TEST_DIR)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(MATRIX_DIR, "handoff.md"))).toBe(false)
      expect(readFileSync(join(MATRIX_DIR, "handoff.consumed.md"), "utf-8")).toBe("new content")
    })
  })

  describe("writeHandoffFile", () => {
    test("creates .matrixx/ dir if missing and writes content, returns true", () => {
      //#given - a directory with no .matrixx subdirectory
      const freshDir = join(tmpdir(), `handoff-write-fresh-${Date.now()}`)
      mkdirSync(freshDir, { recursive: true })
      const content = "---\nkey: value\n---\nbody content"

      //#when
      const result = writeHandoffFile(freshDir, content)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(freshDir, ".matrixx"))).toBe(true)
      expect(readFileSync(join(freshDir, ".matrixx", "handoff.md"), "utf-8")).toBe(content)

      rmSync(freshDir, { recursive: true, force: true })
    })

    test("writes to existing .matrixx/ dir and returns true", () => {
      //#given - .matrixx/ dir already exists (from beforeEach)
      const content = "new handoff content"

      //#when
      const result = writeHandoffFile(TEST_DIR, content)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(MATRIX_DIR, "handoff.md"))).toBe(true)
      expect(readFileSync(join(MATRIX_DIR, "handoff.md"), "utf-8")).toBe(content)
    })

    test("overwrites existing handoff.md", () => {
      //#given - handoff.md already exists with old content
      writeFileSync(join(MATRIX_DIR, "handoff.md"), "old content")

      //#when
      const result = writeHandoffFile(TEST_DIR, "new content")

      //#then
      expect(result).toBe(true)
      expect(readFileSync(join(MATRIX_DIR, "handoff.md"), "utf-8")).toBe("new content")
    })

    test("writes empty string as content", () => {
      //#given - empty content
      const content = ""

      //#when
      const result = writeHandoffFile(TEST_DIR, content)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(MATRIX_DIR, "handoff.md"))).toBe(true)
      expect(readFileSync(join(MATRIX_DIR, "handoff.md"), "utf-8")).toBe("")
    })
  })

  describe("ensureHandoffDir", () => {
    test("creates .matrixx/ dir if missing and returns true", () => {
      //#given - a directory with no .matrixx subdirectory
      const freshDir = join(tmpdir(), `handoff-ensure-fresh-${Date.now()}`)
      mkdirSync(freshDir, { recursive: true })

      //#when
      const result = ensureHandoffDir(freshDir)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(freshDir, ".matrixx"))).toBe(true)

      rmSync(freshDir, { recursive: true, force: true })
    })

    test("returns true when .matrixx/ dir already exists", () => {
      //#given - .matrixx/ dir already exists (from beforeEach)

      //#when
      const result = ensureHandoffDir(TEST_DIR)

      //#then
      expect(result).toBe(true)
      expect(existsSync(MATRIX_DIR)).toBe(true)
    })

    test("creates nested .matrixx/ dir under nested project structure", () => {
      //#given - a nested project directory with no .matrixx subdirectory
      const nestedDir = join(tmpdir(), `handoff-ensure-nested-${Date.now()}`, "a", "b", "c")
      mkdirSync(nestedDir, { recursive: true })

      //#when
      const result = ensureHandoffDir(nestedDir)

      //#then
      expect(result).toBe(true)
      expect(existsSync(join(nestedDir, ".matrixx"))).toBe(true)

      rmSync(join(tmpdir(), `handoff-ensure-nested-${Date.now()}`), {
        recursive: true,
        force: true,
      })
    })
  })
})
