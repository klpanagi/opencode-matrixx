import { isAbsolute, join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { DEFAULT_GLOBS, SILENT_FAILURE_SCAN_DESCRIPTION } from "./constants"
import { scanPath } from "./scanner"
import type { ScanSeverity, SilentFailureScanResult } from "./types"

function errorResult(message: string): SilentFailureScanResult {
  return {
    status: 2,
    findings: [],
    summary: { filesScanned: 0, total: 0, errors: 0, warnings: 0, byRule: {}, waived: 0, waivedByRule: {}, stale: 0, note: message } as SilentFailureScanResult["summary"],
    waived: [],
    staleWaivers: [],
    waiverWarnings: [],
  }
}

export function createSilentFailureScannerTool(ctx: PluginInput): Record<string, ToolDefinition> {
  const silent_failure_scan: ToolDefinition = tool({
    description: SILENT_FAILURE_SCAN_DESCRIPTION,
    args: {
      path: tool.schema
        .string()
        .describe("File or directory to scan (absolute, or relative to the project directory)."),
      globs: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe(`Glob filters when path is a directory (default: ${DEFAULT_GLOBS.join(", ")}).`),
      severity: tool.schema
        .enum(["warn", "error"])
        .optional()
        .describe("Minimum severity to report (default: warn)."),
      waivers: tool.schema
        .string()
        .optional()
        .describe(
          "Project-relative or absolute path to a COMMITTED waiver JSON file (never under gitignored .matrixx/). Findings matching rule+file+symbol are excluded from status but reported in `waived`.",
        )
    },
    async execute(args) {
      try {
        const base = ctx.directory
        const target = isAbsolute(args.path) ? args.path : join(base, args.path)
        const result = scanPath({
          base,
          target,
          globs: args.globs,
          threshold: args.severity as ScanSeverity | undefined,
          waivers: args.waivers as string | undefined,
        })
        return JSON.stringify(result, null, 2)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify(errorResult(`silent_failure_scan failed: ${message}`), null, 2)
      }
    },
  })

  return { silent_failure_scan }
}
