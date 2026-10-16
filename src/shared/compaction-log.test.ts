/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import {
  formatCompactionAppendLog,
  summarizeCompactionAppend,
  utf8ByteLength,
} from "./compaction-log"

describe("utf8ByteLength", () => {
  test("counts ASCII bytes via Buffer.byteLength", () => {
    //#given
    const fragment = "hello"

    //#when
    const result = utf8ByteLength(fragment)

    //#then
    expect(result).toBe(5)
  })

  test("counts multibyte characters as UTF-8 bytes not string length", () => {
    //#given
    const fragment = "héllo→" // é = 2 bytes, → = 3 bytes in UTF-8

    //#when
    const result = utf8ByteLength(fragment)

    //#then
    expect(result).toBe(Buffer.byteLength(fragment, "utf8"))
    expect(result).not.toBe(fragment.length)
  })

  test("empty fragments yield 0 without NaN", () => {
    //#given
    const fragments = ["", undefined, null] as const

    //#when
    const results = fragments.map((f) => utf8ByteLength(f as string))

    //#then
    expect(results).toEqual([0, 0, 0])
    for (const r of results) {
      expect(Number.isNaN(r)).toBe(false)
    }
  })
})

describe("summarizeCompactionAppend", () => {
  test("sums per-source bytes into addedBytes", () => {
    //#given
    const sources = { injector: 10, plan: 20, evolution: 5 }

    //#when
    const summary = summarizeCompactionAppend(sources)

    //#then
    expect(summary.addedBytes).toBe(35)
    expect(summary.sources).toEqual(sources)
  })

  test("empty sources yield 0 total", () => {
    //#given
    const sources = { injector: 0, plan: 0, evolution: 0 }

    //#when
    const summary = summarizeCompactionAppend(sources)

    //#then
    expect(summary.addedBytes).toBe(0)
    expect(Number.isNaN(summary.addedBytes)).toBe(false)
  })
})

describe("formatCompactionAppendLog", () => {
  test("message contains addedBytes and host-truncation note", () => {
    //#given
    const sessionID = "ses-123"
    const sources = { injector: 10, plan: 20, evolution: 5 }

    //#when
    const message = formatCompactionAppendLog(sessionID, sources)

    //#then
    expect(message).toContain("35")
    expect(message).toContain("host truncation not performed by Matrixx")
    expect(message).toContain("Matrixx appended")
  })
})
