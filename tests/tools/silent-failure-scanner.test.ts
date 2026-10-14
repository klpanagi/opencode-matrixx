/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { createSilentFailureScannerTool } from "../../src/tools/silent-failure-scanner"

const FIXTURES = join(import.meta.dir, "..", "fixtures", "silent-failure-scanner")

type Finding = { rule: string; severity: string; file: string; line: number; symbol?: string }
type ScanResult = {
  status: 0 | 1 | 2
  findings: Finding[]
  waived?: Finding[]
  staleWaivers?: unknown[]
  waiverWarnings?: { kind: string; message: string }[]
  waiverFile?: string
  summary: { total: number; waived?: number; stale?: number; byRule: Record<string, number> }
}

function scanner() {
  return createSilentFailureScannerTool({ directory: FIXTURES } as unknown as PluginInput)
}

async function scan(args: Record<string, unknown>): Promise<ScanResult> {
  const tool = scanner().silent_failure_scan
  const output = await tool.execute(args)
  return JSON.parse(output) as ScanResult
}

describe("silent_failure_scan", () => {
  describe("Python scanning", () => {
    test("flags silent-failure anti-patterns in a dirty file", async () => {
      //#given a Python file with bare except/pass, log-then-default, bare gather, indexed gather, and gap-masking flag
      //#when the scanner runs over the file
      const result = await scan({ path: "bad.py" })

      //#then every rule fires and the exit status is errors
      const rules = new Set(result.findings.map((f) => f.rule))
      expect(rules.has("SF001")).toBe(true)
      expect(rules.has("SF002")).toBe(true)
      expect(rules.has("SF003")).toBe(true)
      expect(rules.has("SF004")).toBe(true)
      expect(rules.has("SF005")).toBe(true)
      expect(result.status).toBe(2)
    })

    test("does not flag a clean Python file", async () => {
      //#given a Python file that re-raises and inspects gather results
      //#when the scanner runs over the file
      const result = await scan({ path: "clean.py" })

      //#then no findings and a clean status
      expect(result.findings).toHaveLength(0)
      expect(result.status).toBe(0)
    })

    test("reports line numbers pointing at the offending construct", async () => {
      //#given the dirty fixture
      //#when the scanner runs
      const result = await scan({ path: "bad.py" })
      const sf001 = result.findings.find((f) => f.rule === "SF001")

      //#then the bare except is located on its source line
      expect(sf001).toBeDefined()
      expect(sf001?.line).toBe(10)
    })

    test("severity=error filters warnings out of the report", async () => {
      //#given the dirty fixture and an error-only threshold
      //#when the scanner runs
      const result = await scan({ path: "bad.py", severity: "error" })

      //#then only error-severity rules remain
      expect(result.findings.length).toBeGreaterThan(0)
      expect(result.findings.every((f) => f.severity === "error")).toBe(true)
      expect(result.findings.some((f) => f.rule === "SF002")).toBe(false)
    })
  })

  describe("TypeScript scanning", () => {
    test("flags an empty catch block", async () => {
      //#given a TS file with `catch {}`
      //#when the scanner runs
      const result = await scan({ path: "bad.ts" })

      //#then SF001 fires with error status
      expect(result.findings.some((f) => f.rule === "SF001")).toBe(true)
      expect(result.status).toBe(2)
    })

    test("does not flag a re-throwing catch", async () => {
      //#given a TS file that re-throws
      //#when the scanner runs
      const result = await scan({ path: "clean.ts" })

      //#then no findings
      expect(result.findings).toHaveLength(0)
    })
  })

  describe("waivers", () => {
    test("waived finding is excluded from status but still reported", async () => {
      //#given a file with two SF002 sites and a waiver covering one symbol
      //#when the scanner runs with the waiver file
      const result = await scan({ path: "waived.py", waivers: "waivers.json" })

      //#then only the unwaived site counts toward the status
      expect(result.findings).toHaveLength(1)
      expect(result.findings[0].symbol).toBe("fetch_batch")
      expect(result.waived).toHaveLength(1)
      expect(result.waived?.[0].symbol).toBe("poll_once")
      expect(result.status).toBe(1)
      expect(result.summary.waived).toBe(1)
    })

    test("all findings waived exits clean", async () => {
      //#given waivers covering every finding in the file
      //#when the scanner runs
      const result = await scan({ path: "waived.py", waivers: "waivers-all.json" })

      //#then the report is clean with full transparency
      expect(result.findings).toHaveLength(0)
      expect(result.waived).toHaveLength(2)
      expect(result.status).toBe(0)
    })

    test("stale waiver forces a warning status", async () => {
      //#given a clean file and a waiver matching nothing
      //#when the scanner runs
      const result = await scan({ path: "clean.py", waivers: "waivers-stale.json" })

      //#then the stale entry is reported and status warns
      expect(result.findings).toHaveLength(0)
      expect(result.staleWaivers).toHaveLength(1)
      expect(result.summary.stale).toBe(1)
      expect(result.status).toBe(1)
    })

    test("unreadable waiver file degrades gracefully", async () => {
      //#given a garbage waiver file and a missing one
      //#when the scanner runs
      const bad = await scan({ path: "waived.py", waivers: "waivers-bad.json" })
      const missing = await scan({ path: "waived.py", waivers: "no-such-file.json" })

      //#then the scan continues unfiltered with a recorded warning
      for (const result of [bad, missing]) {
        expect(result.findings).toHaveLength(2)
        expect(result.status).toBe(1)
        expect(result.waiverWarnings?.length).toBeGreaterThan(0)
      }
    })

    test("invalid entries are skipped while valid ones apply", async () => {
      //#given a waiver file with one good and one bad entry
      //#when the scanner runs
      const result = await scan({ path: "waived.py", waivers: "waivers-invalid.json" })

      //#then the valid waiver applies and the bad entry is reported
      expect(result.findings).toHaveLength(1)
      expect(result.waived).toHaveLength(1)
      expect(result.waiverWarnings?.some((w) => w.kind === "invalid-entry")).toBe(true)
    })

    test("waivers under .matrixx are rejected", async () => {
      //#given a waiver path inside gitignored .matrixx state
      //#when the scanner runs
      const result = await scan({ path: "waived.py", waivers: ".matrixx/quality/waivers.json" })

      //#then the file is refused with a warning and nothing is waived
      expect(result.findings).toHaveLength(2)
      expect(result.waived).toHaveLength(0)
      expect(result.waiverWarnings?.length).toBeGreaterThan(0)
    })
  })

  describe("enclosing symbols", () => {
    test("python findings carry their enclosing def", async () => {
      //#given the dirty python fixture
      //#when the scanner runs
      const result = await scan({ path: "bad.py" })

      //#then each finding names its enclosing function
      const byRule = Object.fromEntries(result.findings.map((f) => [f.rule, f.symbol]))
      expect(byRule["SF001"]).toBe("compute")
      expect(byRule["SF002"]).toBe("fetch")
    })

    test("typescript findings carry their enclosing function", async () => {
      //#given the dirty typescript fixture
      //#when the scanner runs
      const result = await scan({ path: "bad.ts" })

      //#then the empty catch names its function
      expect(result.findings[0].symbol).toBe("readConfig")
    })
  })
})
