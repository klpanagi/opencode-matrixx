import { describe, expect, it } from "bun:test"
import { withTimeout } from "./with-timeout"

describe("withTimeout", () => {
  it("should resolve before timeout", async () => {
    const result = await withTimeout(Promise.resolve("done"), 1000)
    expect(result).toBe("done")
  })
  it("should reject on timeout with default message", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 500))
    await expect(withTimeout(slow, 10)).rejects.toThrow("Operation timed out after 10ms")
  })
  it("should reject on timeout with custom message", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 500))
    await expect(withTimeout(slow, 10, "Custom timeout")).rejects.toThrow("Custom timeout")
  })
  it("should reject on promise rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("fail")), 1000)).rejects.toThrow("fail")
  })
})
