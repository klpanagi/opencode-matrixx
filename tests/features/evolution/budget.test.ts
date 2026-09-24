/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as fsp from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
  budgetPath,
  checkPendingCapacity,
  emptyLedger,
  EVOLUTION_DIR,
  isOverDailyCap,
  loadLedger,
  MaxPendingError,
  recordUsageToDisk,
  TraceStore,
  utcDayKey,
} from "../../../src/features/evolution/store"

function evolutionDirOf(projectDir: string): string {
  return path.resolve(projectDir, EVOLUTION_DIR)
}

let tmpDir: string
let origCwd: string

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "budget-test-"))
  origCwd = process.cwd()
  process.chdir(tmpDir)
})

afterEach(async () => {
  process.chdir(origCwd)
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe("budget ledger file I/O (T3)", () => {
  test("missing budget.json fails open to an empty ledger for the UTC day", () => {
    //#given no persisted ledger on disk
    const now = new Date("2026-03-04T10:00:00.000Z")

    //#when loading
    const ledger = loadLedger(evolutionDirOf(tmpDir), now)

    //#then an empty ledger for that UTC day is returned
    expect(ledger).toEqual(emptyLedger("2026-03-04"))
  })

  test("malformed budget.json fails open instead of throwing", () => {
    //#given a corrupt persisted ledger
    const dir = evolutionDirOf(tmpDir)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(budgetPath(dir), "{not-json", "utf-8")

    //#when loading
    const ledger = loadLedger(dir, new Date("2026-03-04T10:00:00.000Z"))

    //#then it degrades to an empty ledger
    expect(ledger.spendCents).toBe(0)
    expect(ledger.events).toEqual([])
    expect(ledger.day).toBe("2026-03-04")
  })

  test("restart reload reads the persisted spend back from disk", () => {
    //#given a charge recorded on disk
    const dir = evolutionDirOf(tmpDir)
    recordUsageToDisk(dir, { inputTokens: 10, outputTokens: 5, costCents: 7 }, new Date("2026-03-04T10:00:00.000Z"))

    //#when a fresh load runs (simulating restart)
    const ledger = loadLedger(dir, new Date("2026-03-04T11:00:00.000Z"))

    //#then the same-day spend survives
    expect(ledger.spendCents).toBe(7)
    expect(ledger.events).toHaveLength(1)
  })

  test("load rolls over to a fresh UTC day when the date changes", () => {
    //#given a charge persisted on day one
    const dir = evolutionDirOf(tmpDir)
    recordUsageToDisk(dir, { inputTokens: 10, outputTokens: 5, costCents: 7 }, new Date("2026-03-04T10:00:00.000Z"))

    //#when loading on the next UTC day
    const ledger = loadLedger(dir, new Date("2026-03-05T00:30:00.000Z"))

    //#then the spend resets
    expect(ledger.day).toBe("2026-03-05")
    expect(ledger.spendCents).toBe(0)
    expect(ledger.events).toEqual([])
  })

  test("sequential charges accumulate through read-modify-write", () => {
    //#given an empty ledger
    const dir = evolutionDirOf(tmpDir)
    const at = new Date("2026-03-04T10:00:00.000Z")

    //#when two charges are recorded sequentially
    recordUsageToDisk(dir, { inputTokens: 1, outputTokens: 1, costCents: 5 }, at)
    recordUsageToDisk(dir, { inputTokens: 1, outputTokens: 1, costCents: 5 }, at)

    //#then both are reflected on disk
    expect(loadLedger(dir, at).spendCents).toBe(10)
  })

  test("isOverDailyCap is inclusive at the configured cap", () => {
    //#given ledgers below, at, and above the cap
    const day = utcDayKey(new Date())
    const below = { day, spendCents: 99, events: [] }
    const atCap = { day, spendCents: 100, events: [] }
    const above = { day, spendCents: 101, events: [] }

    //#when evaluating the cap
    //#then the boundary counts as over
    expect(isOverDailyCap(below, 100)).toBe(false)
    expect(isOverDailyCap(atCap, 100)).toBe(true)
    expect(isOverDailyCap(above, 100)).toBe(true)
  })
})

describe("pending capacity gate (T3)", () => {
  test("checkPendingCapacity throws a typed MaxPendingError at capacity", () => {
    //#given a queue at the configured capacity
    //#when checking capacity
    //#then a typed error carries the observed counts
    expect(() => checkPendingCapacity(50, 50)).toThrow(MaxPendingError)
    try {
      checkPendingCapacity(50, 50)
    } catch (error) {
      expect(error).toBeInstanceOf(MaxPendingError)
      expect((error as MaxPendingError).pending).toBe(50)
      expect((error as MaxPendingError).maxPending).toBe(50)
    }
    expect(() => checkPendingCapacity(49, 50)).not.toThrow()
  })
})

describe("trace retention cleanup (T3)", () => {
  test("cleanup purges trace files older than traceDays", async () => {
    //#given a traces dir with one stale and one fresh file
    const dir = evolutionDirOf(tmpDir)
    const tracesDir = path.join(dir, "traces")
    fs.mkdirSync(tracesDir, { recursive: true })
    const stalePath = path.join(tracesDir, "old.jsonl")
    const freshPath = path.join(tracesDir, "new.jsonl")
    fs.writeFileSync(stalePath, "{}\n", "utf-8")
    fs.writeFileSync(freshPath, "{}\n", "utf-8")
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    fs.utimesSync(stalePath, old, old)

    //#when cleanup runs with a 30-day retention
    await new TraceStore(dir).cleanup(30)

    //#then the stale file is purged and the fresh one survives
    expect(fs.existsSync(stalePath)).toBe(false)
    expect(fs.existsSync(freshPath)).toBe(true)
  })
})
