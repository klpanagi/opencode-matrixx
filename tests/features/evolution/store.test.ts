/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { TraceStore } from "../../../src/features/evolution/store"
import type { TraceRecord } from "../../../src/features/evolution/types"
import { classifySuccess, truncate } from "../../../src/hooks/evolution-watcher/utils"

function makeRecord(overrides: Partial<TraceRecord> & { id: string; sessionID: string }): TraceRecord {
  return {
    callID: `call-${overrides.id}`,
    timestamp: new Date().toISOString(),
    agent: "test-agent",
    tool: "read",
    args: { foo: "bar" },
    output: "ok",
    durationMs: 10,
    success: true,
    ...overrides,
  }
}

async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "evolution-test-"))
}

describe("TraceStore", () => {
  test("append creates JSONL file and readSession returns same record", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    const record = makeRecord({ id: "r1", sessionID: "ses-a" })
    try {
      //#when
      await store.append(record)
      const result = await store.readSession("ses-a")
      //#then
      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe("r1")
      const raw = await fs.readFile(path.join(tmpDir, "traces", "ses-a.jsonl"), "utf-8")
      expect(raw.trim()).toBe(JSON.stringify(record))
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("append multiple records to same sessionID returns all", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      await store.append(makeRecord({ id: "r1", sessionID: "ses-a" }))
      await store.append(makeRecord({ id: "r2", sessionID: "ses-a" }))
      await store.append(makeRecord({ id: "r3", sessionID: "ses-a" }))
      const result = await store.readSession("ses-a")
      //#then
      expect(result.map((r) => r.id)).toEqual(["r1", "r2", "r3"])
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("append to different sessionIDs creates separate files", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      await store.append(makeRecord({ id: "r1", sessionID: "ses-a" }))
      await store.append(makeRecord({ id: "r2", sessionID: "ses-b" }))
      const a = await store.readSession("ses-a")
      const b = await store.readSession("ses-b")
      //#then
      expect(a[0]?.id).toBe("r1")
      expect(b[0]?.id).toBe("r2")
      const files = await fs.readdir(path.join(tmpDir, "traces"))
      expect(files.sort()).toEqual(["ses-a.jsonl", "ses-b.jsonl"])
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("ringBuffer evicts oldest after 500 and getRecent respects limits", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      for (let i = 0; i < 501; i++) {
        await store.append(makeRecord({ id: `r${i}`, sessionID: "ses-ring" }))
      }
      const recent50 = store.getRecent(50)
      const recentAll = store.getRecent(600)
      const recentDefault = store.getRecent()
      //#then
      expect(recent50).toHaveLength(50)
      expect(recent50[0]?.id).toBe("r451")
      expect(recentAll).toHaveLength(500)
      expect(recentAll[0]?.id).toBe("r1")
      expect(recentDefault).toHaveLength(50)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("getAllTraces fallback to ringBuffer when disk empty", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      await store.append(makeRecord({ id: "r1", sessionID: "ses-fallback" }))
      await store.append(makeRecord({ id: "r2", sessionID: "ses-other" }))
      await fs.rm(path.join(tmpDir, "traces", "ses-fallback.jsonl"), { force: true })
      //#when
      const result = await store.getAllTraces("ses-fallback")
      //#then
      expect(result).toHaveLength(1)
      expect(result[0]?.id).toBe("r1")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("cleanup deletes old files older than retentionDays and keeps recent", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      await store.append(makeRecord({ id: "r-old", sessionID: "ses-old" }))
      await store.append(makeRecord({ id: "r-new", sessionID: "ses-new" }))
      const oldPath = path.join(tmpDir, "traces", "ses-old.jsonl")
      const newPath = path.join(tmpDir, "traces", "ses-new.jsonl")
      const oldTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      await fs.utimes(oldPath, oldTime, oldTime)
      //#when
      await store.cleanup(1)
      //#then
      const oldExists = await fs.stat(oldPath).then(() => true).catch(() => false)
      const newExists = await fs.stat(newPath).then(() => true).catch(() => false)
      expect(oldExists).toBe(false)
      expect(newExists).toBe(true)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("readSession returns empty array when file missing", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      const result = await store.readSession("nonexistent")
      //#then
      expect(result).toEqual([])
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("getState returns defaults when missing and updateState merges and persists", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      const initial = await store.getState()
      //#then
      expect(initial).toEqual({ totalTraces: 0, totalCompressions: 0 })

      //#when
      await store.updateState({ totalTraces: 5, totalCompressions: 2 })
      const afterFirst = await store.getState()
      //#then
      expect(afterFirst.totalTraces).toBe(5)

      //#when
      await store.updateState({ lastCompressionAt: "2026-01-01T00:00:00.000Z" })
      const afterSecond = await store.getState()
      //#then
      expect(afterSecond.lastCompressionAt).toBe("2026-01-01T00:00:00.000Z")
      expect(afterSecond.totalTraces).toBe(5)
      const raw = await fs.readFile(path.join(tmpDir, "state.json"), "utf-8")
      expect(JSON.parse(raw).totalTraces).toBe(5)
      const tmpExists = await fs.stat(path.join(tmpDir, "state.json.tmp")).then(() => true).catch(() => false)
      expect(tmpExists).toBe(false)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })

  test("appendAudit creates audit.log line with JSON", async () => {
    //#given
    const tmpDir = await createTmpDir()
    const store = new TraceStore(tmpDir)
    try {
      //#when
      await store.appendAudit({ action: "promote", skill: "my-skill" })
      await store.appendAudit({ action: "reject", reason: "low-confidence" })
      const content = await fs.readFile(path.join(tmpDir, "audit.log"), "utf-8")
      const lines = content.trim().split("\n")
      //#then
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0] as string).action).toBe("promote")
      expect(JSON.parse(lines[1] as string).action).toBe("reject")
      expect(JSON.parse(lines[0] as string)).toHaveProperty("timestamp")
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})

describe("truncate", () => {
  test("returns same string when under maxChars", () => {
    //#given
    const value = "hello"
    //#when
    const result = truncate(value, 10)
    //#then
    expect(result).toBe("hello")
  })

  test("slices at maxChars and appends marker when over", () => {
    //#given
    const value = "abcdefghij"
    //#when
    const result = truncate(value, 4)
    //#then
    expect(result).toBe("abcd…[truncated]")
  })
})

describe("classifySuccess", () => {
  test("detects generic_error", () => {
    //#given
    const tool = "bash"
    const output = "Error: something went wrong"
    //#when
    const result = classifySuccess(tool, output)
    //#then
    expect(result).toEqual({ success: false, errorType: "generic_error" })
  })

  test("detects diagnostics_error for lsp_diagnostics", () => {
    //#given
    const tool = "lsp_diagnostics"
    const output = "found 2 error in file"
    //#when
    const result = classifySuccess(tool, output)
    //#then
    expect(result).toEqual({ success: false, errorType: "diagnostics_error" })
  })

  test("detects edit_mismatch for edit tool", () => {
    //#given
    const tool = "edit"
    const output = "mismatch: expected hashline not found"
    //#when
    const result = classifySuccess(tool, output)
    //#then
    expect(result).toEqual({ success: false, errorType: "edit_mismatch" })
  })

  test("returns success true for clean output", () => {
    //#given
    const tool = "read"
    const output = "file content here, all good"
    //#when
    const result = classifySuccess(tool, output)
    //#then
    expect(result).toEqual({ success: true })
  })

  test("generic_error takes precedence over diagnostics_error", () => {
    //#given
    const tool = "lsp_diagnostics"
    const output = "Error: diagnostics failed"
    //#when
    const result = classifySuccess(tool, output)
    //#then
    expect(result.errorType).toBe("generic_error")
  })
})
