import crypto from "node:crypto"
import * as fs from "node:fs"
import { generateMessages } from "@cucumber/gherkin"
import { SourceMediaType } from "@cucumber/messages"
import { type ToolDefinition, tool } from "@opencode-ai/plugin"

/**
 * Recursively convert a value to a plain JSON-serializable object.
 * Strips `location` keys when `includeSourceMap` is false.
 */
function toPlainObject(value: unknown, includeSourceMap: boolean): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map((v) => toPlainObject(v, includeSourceMap))
  if (typeof value !== "object") return value

  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (!includeSourceMap && key === "location") continue
    result[key] = toPlainObject(val, includeSourceMap)
  }
  return result
}

/**
 * Create a tool that parses Gherkin .feature files into structured JSON AST.
 */
export function createBddParseGherkinTool(): ToolDefinition {
  return tool({
    description: `Parse a Gherkin .feature file into a structured JSON AST.

Returns a JSON object with:
- success: boolean indicating whether parsing succeeded
- data: the parsed GherkinDocument AST (when success is true)
- error: error message (when success is false)`,
    args: {
      filePath: tool.schema.string().describe("Path to .feature file"),
      includeSourceMap: tool.schema
        .boolean()
        .default(false)
        .describe("Include location (line/column) information in the output"),
    },
    async execute(args): Promise<string> {
      try {
        let content: string
        try {
          content = fs.readFileSync(args.filePath, "utf-8")
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return JSON.stringify({ success: false, error: message })
        }

        // Handle empty content — return empty feature AST
        if (!content.trim()) {
          return JSON.stringify({
            success: true,
            data: {
              feature: {
                keyword: "Feature",
                name: "",
                description: "",
                language: "en",
                tags: [],
                children: [],
              },
              comments: [],
            },
          })
        }

        const envelopes = generateMessages(
          content,
          args.filePath,
          SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
          {
            includeGherkinDocument: true,
            includePickles: true,
            newId: () => crypto.randomUUID(),
          },
        )

        const doc = envelopes.find((e) => e.gherkinDocument)?.gherkinDocument

        if (!doc) {
          return JSON.stringify({ success: false, error: "No GherkinDocument in parse result" })
        }

        const plain = toPlainObject(doc, args.includeSourceMap ?? false)
        return JSON.stringify({ success: true, data: plain })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })
}
