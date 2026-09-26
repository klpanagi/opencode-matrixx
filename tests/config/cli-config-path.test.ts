import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveOpencodeCliConfigPath } from "../../src/config"

const TEST_DIR = join(tmpdir(), `.matrixx-cli-config-${process.pid}`)

describe("resolveOpencodeCliConfigPath", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true })
  })

  test("prefers cli.json when only cli.json exists", () => {
    //#given
    writeFileSync(join(TEST_DIR, "cli.json"), "{}")

    //#when
    const result = resolveOpencodeCliConfigPath(TEST_DIR)

    //#then
    expect(result.source).toBe("cli")
    expect(result.path).toBe(join(TEST_DIR, "cli.json"))
    expect(result.format).toBe("json")
  })

  test("recognizes tui.json when only tui.json exists", () => {
    //#given
    writeFileSync(join(TEST_DIR, "tui.json"), "{}")

    //#when
    const result = resolveOpencodeCliConfigPath(TEST_DIR)

    //#then
    expect(result.source).toBe("tui")
    expect(result.path).toBe(join(TEST_DIR, "tui.json"))
    expect(result.format).toBe("json")
  })

  test("prefers cli.json over tui.json when both exist", () => {
    //#given
    writeFileSync(join(TEST_DIR, "cli.json"), "{}")
    writeFileSync(join(TEST_DIR, "tui.json"), "{}")

    //#when
    const result = resolveOpencodeCliConfigPath(TEST_DIR)

    //#then
    expect(result.source).toBe("cli")
    expect(result.path).toBe(join(TEST_DIR, "cli.json"))
  })

  test("prefers jsonc over json for the same base name", () => {
    //#given
    writeFileSync(join(TEST_DIR, "cli.jsonc"), "{}")
    writeFileSync(join(TEST_DIR, "cli.json"), "{}")

    //#when
    const result = resolveOpencodeCliConfigPath(TEST_DIR)

    //#then
    expect(result.source).toBe("cli")
    expect(result.format).toBe("jsonc")
    expect(result.path).toBe(join(TEST_DIR, "cli.jsonc"))
  })

  test("defaults to cli.json path when neither exists", () => {
    //#given / #when
    const result = resolveOpencodeCliConfigPath(TEST_DIR)

    //#then
    expect(result.source).toBe("default")
    expect(result.format).toBe("none")
    expect(result.path).toBe(join(TEST_DIR, "cli.json"))
  })
})
