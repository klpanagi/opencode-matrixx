/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { HASHLINE_DICT, HASHLINE_REF_PATTERN, NIBBLE_STR } from "../../../src/tools/hashline-edit/constants"
import { computeLineHash, formatHashLine } from "../../../src/tools/hashline-edit/hash-computation"
import { HashlineMismatchError, parseLineRef, validateLineRefs } from "../../../src/tools/hashline-edit/validation"

/**
 * The per-line anchor was 8 bits (2 CID chars) for the life of the feature.
 * These tests pin the widened contract: 32 bits / 4 chars, no collisions on a
 * realistically sized file, and a legacy 2-char anchor that is still checked.
 */

const NIBBLE_CLASS = `[${NIBBLE_STR}]`

function buildLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `  const value${i} = compute(${i}) // unique line ${i}`)
}

describe("hashline id width", () => {
  test("computeLineHash returns a 4-character id from the NIBBLE_STR alphabet", () => {
    //#given a representative source line
    const content = '  console.log("hi");'

    //#when the anchor is computed
    const hash = computeLineHash(7, content)

    //#then it is four CID characters, not two
    expect(hash).toHaveLength(4)
    expect(hash).toMatch(new RegExp(`^${NIBBLE_CLASS}{4}$`))
  })

  test("HASHLINE_DICT is generated at 65536 entries, not hand-written", () => {
    //#given the generated dictionary
    //#then it covers the whole 16-bit index space with unique 4-char ids
    expect(HASHLINE_DICT).toHaveLength(65536)
    expect(new Set(HASHLINE_DICT).size).toBe(65536)
    expect(HASHLINE_DICT[0]).toHaveLength(4)
    expect(HASHLINE_DICT[65535]).toHaveLength(4)
  })

  test("collision exposure on a 1500-line file is bounded and tiny", () => {
    //#given a 1500-line file (a real plan is ~1200 lines)
    const lines = buildLines(1500)

    //#when every line is hashed as a read would
    const ids = lines.map((line, i) => computeLineHash(i + 1, line))
    const distinct = new Set(ids).size

    //#then the colliding-pair count is far below the old 8-bit figure.
    // Birthday math: N(N-1)/2M. At 8 bits (M=256) that is 4,393 pairs for
    // 1500 lines; at 16 bits (M=65,536) it is ~17. 4 chars buys a 256x
    // reduction in ambiguous anchors. It does NOT make collisions impossible —
    // 65,536 buckets cannot hold 1,500 ids collision-free by the pigeonhole
    // principle, so this asserts the bound, not absolute distinctness.
    const counts = new Map<string, number>()
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    let collidingPairs = 0
    for (const n of counts.values()) collidingPairs += (n * (n - 1)) / 2
    expect(ids).toHaveLength(1500)
    expect(collidingPairs).toBeLessThan(60)
    expect(collidingPairs).toBeLessThan(1500 * 1499 / 512 / 20)
  })

  test("a stale anchor from line A is rejected when replayed on line B", () => {
    //#given a large file and a valid anchor for line 1
    const lines = buildLines(1500)
    const hashPart = computeLineHash(1, lines[0])

    //#when line 300 drifts and line 1's anchor is replayed against it
    const drifted = [...lines]
    drifted[299] = "  const value299 = compute(9999) // drifted"

    //#then validation fails rather than editing an unrelated line
    expect(() => validateLineRefs(drifted, [`300#${hashPart}`])).toThrow(HashlineMismatchError)
  })

  test("an anchor stays valid while the target line is unchanged", () => {
    //#given an anchor for line 42 of a large file
    const lines = buildLines(1500)
    const ref = `42#${computeLineHash(42, lines[41])}`

    //#when nothing has drifted
    //#then validation passes — the widening did not break the happy path
    expect(() => validateLineRefs(lines, [ref])).not.toThrow()
  })

  test("formatHashLine emits a line#hash|width form at the 4-char width", () => {
    //#given a source line
    const content = "function hello() {"

    //#when it is formatted for read output
    const formatted = formatHashLine(42, content)

    //#then the anchor is 4 chars wide
    expect(formatted).toMatch(new RegExp(`^42#${NIBBLE_CLASS}{4}\\|${content.replace(/[(){}]/g, "\\$&")}$`))
  })
})

describe("hashline id backward compatibility", () => {
  test("a legacy 2-character anchor is still parsed", () => {
    //#given an anchor emitted by an older read
    const ref = "12#VK"

    //#when it is parsed
    const parsed = parseLineRef(ref)

    //#then line and hash are recovered rather than hard-failing
    expect(parsed.line).toBe(12)
    expect(parsed.hash).toBe("VK")
  })

  test("a legacy 2-character anchor that matches the line is accepted", () => {
    //#given a line and the 8-bit anchor the old implementation would have produced
    const lines = ["const alpha = 1"]
    const legacy = legacyHashFor(1, lines[0])

    //#when the legacy anchor is validated against that line
    //#then it passes — an in-flight edit from an older read is not broken
    expect(() => validateLineRefs(lines, [`1#${legacy}`])).not.toThrow()
  })

  test("a legacy 2-character anchor for the wrong line is rejected", () => {
    //#given a legacy anchor computed for a different line's content
    const lines = ["const alpha = 1", "const beta = 2", "const gamma = 3"]
    const legacy = legacyHashFor(1, "const totallyDifferent = 999")

    //#when it is replayed against line 3
    //#then it is still checked, just more weakly
    expect(() => validateLineRefs(lines, [`3#${legacy}`])).toThrow()
  })

  test("a 4-character anchor is the canonical HASHLINE_REF_PATTERN shape", () => {
    //#given the canonical pattern
    //#then it accepts 4 chars and rejects 2 and 3
    expect(HASHLINE_REF_PATTERN.test("1#ZPMQ")).toBe(true)
    expect(HASHLINE_REF_PATTERN.test("1#ZP")).toBe(false)
    expect(HASHLINE_REF_PATTERN.test("1#ZPM")).toBe(false)
  })
})

/** Reproduces the pre-widening 8-bit anchor for compatibility tests. */
function legacyHashFor(lineNumber: number, content: string): string {
  const stripped = content.replace(/\r/g, "").trimEnd()
  const seed = /[\p{L}\p{N}]/u.test(stripped) ? 0 : lineNumber
  const index = Bun.hash.xxHash32(stripped, seed) % 256
  const high = index >>> 4
  const low = index & 0x0f
  return `${NIBBLE_STR[high]}${NIBBLE_STR[low]}`
}
