/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

describe("evolution-compressor honesty suffix", () => {
  test("exports a trace-store-only honesty suffix constant", async () => {
    //#given
    const mod = await import("./index")

    //#when
    const suffix: unknown = mod.EVOLUTION_COMPRESSOR_HONESTY_SUFFIX

    //#then
    expect(typeof suffix).toBe("string")
    expect(suffix).toContain("context-freed=0")
    expect(suffix).toContain("trace-store only")
    expect(suffix).toContain("not performed")
  })

  test("staged/promoted log call site includes the honesty suffix", async () => {
    //#given
    const source = fs.readFileSync(path.join(import.meta.dir, "index.ts"), "utf-8")

    //#when
    const stagedLine = source.split("\n").find((line) => line.includes("staged=$" + "{result.staged}"))

    //#then
    expect(stagedLine).toBeDefined()
    expect(stagedLine as string).toMatch(/trace-store only|not performed|EVOLUTION_COMPRESSOR_HONESTY_SUFFIX/)
  })
})
