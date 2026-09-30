import { describe, expect, it } from "bun:test"
import { HASHLINE_ID_LENGTH, NIBBLE_CHARSET } from "../../../src/tools/hashline-edit/constants"
import { computeLineHash, formatHashLine, formatHashLines } from "../../../src/tools/hashline-edit/hash-computation"

// Derived from the production constants so the pattern cannot drift from the
// width and alphabet the implementation actually emits.
const HASH_ID_PATTERN = new RegExp(`^[${NIBBLE_CHARSET}]{${HASHLINE_ID_LENGTH}}$`)

describe("computeLineHash", () => {
  it("returns consistent 4-char NIBBLE ID for same input", () => {
    //#given
    const lineNumber = 1
    const content = "function hello() {"

    //#when
    const hash1 = computeLineHash(lineNumber, content)
    const hash2 = computeLineHash(lineNumber, content)

    //#then
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(HASH_ID_PATTERN)
    expect(hash1).toHaveLength(4)
    expect(hash1).toBe("VRRM")
  })

  it("trims trailing whitespace before hashing (not all whitespace)", () => {
    //#given
    const lineNumber = 1
    const content1 = "function hello() {"
    const content2 = "function hello() {   "

    //#when
    const hash1 = computeLineHash(lineNumber, content1)
    const hash2 = computeLineHash(lineNumber, content2)

    //#then
    expect(hash1).toBe(hash2)
  })

  it("leading whitespace is significant (different hashes)", () => {
    //#given
    const lineNumber = 1
    const content1 = "function hello() {"
    const content2 = "  function hello() {"

    //#when
    const hash1 = computeLineHash(lineNumber, content1)
    const hash2 = computeLineHash(lineNumber, content2)

    //#then
    expect(hash1).not.toBe(hash2)
  })

  it("handles empty lines", () => {
    //#given
    const lineNumber = 1
    const content = ""

    //#when
    const hash = computeLineHash(lineNumber, content)

    //#then
    expect(hash).toMatch(HASH_ID_PATTERN)
    expect(hash).toHaveLength(4)
    expect(hash).toBe("XSKM")
  })
  it("returns different hashes for different content", () => {
    //#given
    const lineNumber = 1
    const content1 = "function hello() {"
    const content2 = "function world() {"

    //#when
    const hash1 = computeLineHash(lineNumber, content1)
    const hash2 = computeLineHash(lineNumber, content2)

    //#then
    expect(hash1).not.toBe(hash2)
  })

  it("uses NIBBLE_STR charset for blank lines", () => {
    //#given
    const content = ""

    //#when
    const hash = computeLineHash(1, content)

    //#then — hash uses NIBBLE_STR (ZPMQVRWSNKTXJBYH), must be 4 chars from that set
    expect(hash).toMatch(HASH_ID_PATTERN)
    expect(hash).toHaveLength(4)
    expect(hash).toBe("XSKM")
  })
})

describe("formatHashLine", () => {
  it("formats line with LINE#ID|content format", () => {
    //#given
    const lineNumber = 42
    const content = "function hello() {"

    //#when
    const result = formatHashLine(lineNumber, content)

    //#then
    expect(result).toBe("42#VRRM|function hello() {")
  })

  it("uses # separator not : separator", () => {
    //#given
    const lineNumber = 1
    const content = "const x = 42"

    //#when
    const result = formatHashLine(lineNumber, content)

    //#then
    expect(result).toContain("#")
    expect(result).not.toMatch(/^\d+:/)
    expect(result).toContain("|const x = 42")
  })
})

describe("formatHashLines", () => {
  it("formats all lines with LINE#ID| prefixes", () => {
    //#given
    const content = "function hello() {\n  return 42\n}"

    //#when
    const result = formatHashLines(content)

    //#then
    const lines = result.split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe("1#VRRM|function hello() {")
    expect(lines[1]).toBe("2#XHZN|  return 42")
    expect(lines[2]).toBe("3#NHRZ|}")
  })

  it("handles empty file", () => {
    //#given
    const content = ""

    //#when
    const result = formatHashLines(content)

    //#then
    expect(result).toBe("")
  })

  it("handles single line", () => {
    //#given
    const content = "const x = 42"

    //#when
    const result = formatHashLines(content)

    //#then
    expect(result).toBe("1#PVXV|const x = 42")
  })
})
