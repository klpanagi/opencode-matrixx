import { describe, expect, it } from "bun:test"
import { isAbortError } from "./is-abort-error"

describe("isAbortError", () => {
  it("should return true for MessageAbortedError", () => {
    expect(isAbortError(new Error("MessageAbortedError"))).toBe(true)
  })
  it("should return true for aborted message", () => {
    expect(isAbortError(new Error("The operation was aborted"))).toBe(true)
  })
  it("should return true for cancelled message", () => {
    expect(isAbortError(new Error("Request cancelled"))).toBe(true)
  })
  it("should return true for interrupted message", () => {
    expect(isAbortError(new Error("Connection interrupted"))).toBe(true)
  })
  it("should return false for other errors", () => {
    expect(isAbortError(new Error("Something went wrong"))).toBe(false)
  })
  it("should return false for non-Error values", () => {
    expect(isAbortError("string")).toBe(false)
    expect(isAbortError(null)).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
  })
  it("should return false for empty input", () => {
    expect(isAbortError("")).toBe(false)
  })
})
