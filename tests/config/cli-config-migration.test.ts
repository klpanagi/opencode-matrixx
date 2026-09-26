/// <reference types="bun-types" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { migrateOpencodeCliConfig } from "../../src/config"

const TEST_DIR = join(tmpdir(), `.matrixx-cli-migration-${process.pid}`)

describe("migrateOpencodeCliConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test("copies a legacy tui.json to cli.json without deleting the original", () => {
    //#given
    const tui = join(TEST_DIR, "tui.json")
    writeFileSync(tui, '{"theme":"dark"}')

    //#when
    const result = migrateOpencodeCliConfig(TEST_DIR)

    //#then
    expect(result.migrated).toBe(true)
    expect(result.action).toBe("copied")
    expect(result.path).toBe(join(TEST_DIR, "cli.json"))
    expect(JSON.parse(readFileSync(join(TEST_DIR, "cli.json"), "utf8"))).toEqual({ theme: "dark" })
    // V1 OpenCode still reads tui.json — it must survive.
    expect(existsSync(tui)).toBe(true)
  })

  test("copies a legacy tui.jsonc preserving the .jsonc extension", () => {
    //#given
    const tui = join(TEST_DIR, "tui.jsonc")
    writeFileSync(tui, '{\n  // comment\n  "theme": "dark",\n}\n')

    //#when
    const result = migrateOpencodeCliConfig(TEST_DIR)

    //#then
    expect(result.migrated).toBe(true)
    expect(result.format).toBe("jsonc")
    expect(result.path).toBe(join(TEST_DIR, "cli.jsonc"))
    expect(readFileSync(join(TEST_DIR, "cli.jsonc"), "utf8")).toContain("// comment")
  })

  test("never overwrites an existing cli.json", () => {
    //#given
    writeFileSync(join(TEST_DIR, "tui.json"), '{"theme":"dark"}')
    writeFileSync(join(TEST_DIR, "cli.json"), '{"theme":"light"}')

    //#when
    const result = migrateOpencodeCliConfig(TEST_DIR)

    //#then
    expect(result.migrated).toBe(false)
    expect(result.action).toBe("skipped-existing")
    expect(JSON.parse(readFileSync(join(TEST_DIR, "cli.json"), "utf8"))).toEqual({ theme: "light" })
  })

  test("reports nothing to do when no legacy file exists", () => {
    //#given / #when
    const result = migrateOpencodeCliConfig(TEST_DIR)

    //#then
    expect(result.migrated).toBe(false)
    expect(result.action).toBe("skipped-absent")
  })

  test("is idempotent — a second run is a no-op", () => {
    //#given
    writeFileSync(join(TEST_DIR, "tui.json"), '{"theme":"dark"}')
    migrateOpencodeCliConfig(TEST_DIR)

    //#when
    const result = migrateOpencodeCliConfig(TEST_DIR)

    //#then
    expect(result.migrated).toBe(false)
    expect(result.action).toBe("skipped-existing")
  })
})
