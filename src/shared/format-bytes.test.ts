import { describe, expect, it } from "bun:test"
import { formatBytes } from "./format-bytes"

describe("formatBytes", () => {
  it("should return bytes for < 1024", () => {
    expect(formatBytes(500)).toBe("500B")
  })
  it("should return KB for < 1MB", () => {
    expect(formatBytes(2048)).toBe("2.0KB")
  })
  it("should return MB for >= 1MB", () => {
    expect(formatBytes(1048576)).toBe("1.0MB")
  })
  it("should handle 0 bytes", () => {
    expect(formatBytes(0)).toBe("0B")
  })
})
