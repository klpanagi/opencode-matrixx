import { describe, expect, test } from "bun:test"

describe("CLI module exports", () => {
  test("main function is exported", async () => {
    const cli = await import("../../src/cli/index")
    expect(cli.main).toBeDefined()
    expect(typeof cli.main).toBe("function")
  })
})
