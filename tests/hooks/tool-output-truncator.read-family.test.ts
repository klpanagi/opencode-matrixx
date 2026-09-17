/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import { createToolOutputTruncatorHook } from "../../src/hooks/tool-output-truncator"

// TODO-4 (issue #110 A7): a single read can attach ~25k type tokens
// (upstream OpenCode LSP <types> dumps). Read-family tools truncate at ~10k
// tokens, tail-only, preserving header + LINE#ID anchors.
// Rationale for deferring lsp_symbols: symbol listings are small structured
// results with no observed dumps; revisit if dumps appear.
function bigReadOutput(lines = 3000): string {
  const header = ["1#AA|// header line one", "2#BB|// header line two", "3#CC|// header line three"]
  const body = Array.from({ length: lines }, (_, i) => `${i + 4}#ZZ|export type T${i} = string | number | boolean;`)
  return [...header, ...body].join("\n")
}

describe("read-family truncation", () => {
  for (const tool of ["read", "Read", "lookup_type", "list_types"]) {
    test(`${tool} truncates oversized output with marker, header preserved`, async () => {
      //#given oversized read-family output (>10k tokens)
      const hook = createToolOutputTruncatorHook({} as never)
      const input = { tool, sessionID: "todo4", callID: "c1" }
      const raw = bigReadOutput()
      expect(Math.ceil(raw.length / 4)).toBeGreaterThan(10_000)
      const output = { title: "Result", output: raw, metadata: {} }
      //#when post-tool hook runs
      await hook["tool.execute.after"](input, output)
      //#then tail cut with marker, header + LINE#ID anchors intact
      expect(output.output.length).toBeLessThan(raw.length)
      expect(output.output).toContain("truncated due to context window limit")
      expect(output.output).toContain("1#AA|// header line one")
      expect(output.output).toContain("2#BB|// header line two")
    })
  }

  test("small read output passes through untouched", async () => {
    //#given small read output
    const hook = createToolOutputTruncatorHook({} as never)
    const input = { tool: "read", sessionID: "todo4", callID: "c2" }
    const output = { title: "Result", output: "1#AA|const x = 1;\n", metadata: {} }
    //#when post-tool hook runs
    await hook["tool.execute.after"](input, output)
    //#then unchanged, no marker
    expect(output.output).toBe("1#AA|const x = 1;\n")
  })

  test("lsp_symbols deferred — not truncated", async () => {
    //#given oversized symbol output
    const hook = createToolOutputTruncatorHook({} as never)
    const input = { tool: "lsp_symbols", sessionID: "todo4", callID: "c3" }
    const raw = bigReadOutput()
    const output = { title: "Result", output: raw, metadata: {} }
    //#when post-tool hook runs
    await hook["tool.execute.after"](input, output)
    //#then untouched (deferred with rationale above)
    expect(output.output).toBe(raw)
  })
})
