import * as fs from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import { type Annotations, parseAnnotations } from "../../features/bdd/annotations"
import { ContractSchema } from "../../features/bdd/schema"

/** Map nested Annotations to the flat ContractAnnotations shape. */
function mapAnnotations(ann: Annotations): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const api: Array<{ method: string; path: string }> = [
    ...ann.api.endpoints.map((e) => ({ method: e.method, path: e.path })),
    ...ann.api.responses.map((r) => ({ method: r.status, path: r.format })),
  ]
  if (api.length > 0) result.api = api
  const ui: Array<{ component: string; description?: string }> = [
    ...ann.ui.routes.flatMap((r) =>
      Object.entries(r).map(([k, v]) => ({ component: k, description: v })),
    ),
    ...ann.ui.testIds.flatMap((t) =>
      Object.entries(t).map(([k, v]) => ({ component: k, description: v })),
    ),
    ...ann.ui.strings.map((s) => ({
      component: `${s.category}.${s.key}`,
      description: s.value,
    })),
  ]
  if (ui.length > 0) result.ui = ui
  const state: Array<{ key: string; description?: string }> = [
    ...ann.state.variables.map((v) => ({ key: v.name, description: v.type })),
    ...ann.state.initial.map((i) => ({ key: i.key, description: i.value })),
    ...ann.state.preconditions.map((p) => ({ key: p.key, description: p.value })),
  ]
  if (state.length > 0) result.state = state
  if (ann.assumptions.length > 0) result.assumptions = ann.assumptions
  return result
}

/** Extract a step from the Gherkin AST. */
function extractStep(s: Record<string, unknown>): Record<string, unknown> {
  const step: Record<string, unknown> = {
    keyword: (s.keyword as string)?.trim(),
    text: s.text,
  }
  if (s.dataTable) {
    const dt = s.dataTable as Record<string, unknown>
    const rows = (dt.rows ?? []) as Array<Record<string, unknown>>
    const headers = (rows[0]?.cells as Array<Record<string, unknown>>)?.map(
        (c: any) => c.value as string,
      ) ?? []
    step.dataTable = rows.slice(1).map((row: Record<string, unknown>) => {
      const obj: Record<string, string> = {}
      ;((row.cells ?? []) as any[]).forEach((cell: any, i: number) => {
        if (i < headers.length) obj[headers[i]] = cell.value as string
      })
      return obj
    })
  }
  if (s.docString) {
    step.docString = (s.docString as Record<string, unknown>).content as string
  }
  return step
}

/** Extract a scenario from the Gherkin AST. */
function extractScenario(s: Record<string, unknown>): Record<string, unknown> {
  const scenario: Record<string, unknown> = {
    name: s.name,
    tags: ((s.tags ?? []) as Array<Record<string, unknown>>).map(
      (t: any) => t.name as string,
    ),
    steps: ((s.steps ?? []) as Array<Record<string, unknown>>).map(extractStep),
  }
  if (s.examples) {
    const examples = s.examples as Array<Record<string, unknown>>
    const exampleRows: Array<Record<string, string>> = []
    for (const ex of examples) {
      const headers =
        (ex.tableHeader as any)?.cells?.map((c: any) => c.value as string) ?? []
      for (const row of (ex.tableBody ?? []) as Array<any>) {
        const obj: Record<string, string> = {}
        ;(row.cells ?? []).forEach((cell: any, i: number) => {
          if (i < headers.length) obj[headers[i]] = cell.value as string
        })
        exampleRows.push(obj)
      }
    }
    scenario.examples = exampleRows
  }
  return scenario
}

/** Create a tool that produces a Contract JSON from a parsed Gherkin AST. */
export function createBddCreateContractTool(): ToolDefinition {
  return tool({
    description:
      "Create a structured contract JSON from a parsed Gherkin AST. " +
      "Parses annotations from the .feature source text, builds a Contract " +
      "object, validates against ContractSchema, and writes to disk.",
    args: {
      parsedAst: tool.schema
        .string()
        .describe("JSON-serialized GherkinDocument AST from bdd_parse_gherkin"),
      sourceFile: tool.schema.string().describe("Original .feature file path"),
      sourceText: tool.schema
        .string()
        .describe("Original .feature file content for annotation parsing"),
      force: tool.schema
        .boolean()
        .default(false)
        .describe("Overwrite existing contract file"),
      outputPath: tool.schema
        .string()
        .optional()
        .describe("Custom output path; defaults to <sourceFile>.contract.json"),
    },
    async execute(args): Promise<string> {
      try {
        const parsed = JSON.parse(args.parsedAst as string)
        const doc = (parsed?.data as Record<string, unknown>) ?? parsed
        if (!doc?.feature) {
          return JSON.stringify({ success: false, error: "Invalid GherkinDocument AST: missing feature" })
        }
        const sourceFile = args.sourceFile as string
        const ann = parseAnnotations(args.sourceText as string)
        const feature = doc.feature as Record<string, unknown>
        const children = (feature.children ?? []) as Array<Record<string, unknown>>
        const bgChild = children.find((c) => c.background)
        const scenarios = children
          .filter((c) => c.scenario)
          .map((c) => extractScenario(c.scenario as Record<string, unknown>))
        const ruleChildren = children.filter((c) => c.rule)
        const rules = ruleChildren.map((c: any) => ({
          name: c.rule.name as string,
          description: (c.rule.description as string) || undefined,
          scenarios: ((c.rule.children ?? []) as Array<Record<string, unknown>>)
            .filter((rc: any) => rc.scenario)
            .map((rc: any) =>
              extractScenario(rc.scenario as Record<string, unknown>),
            ),
        }))
        const contract = {
          schemaVersion: 1 as const,
          generatedAt: new Date().toISOString(),
          sourceFile,
          feature: {
            name: feature.name as string,
            description: (feature.description as string) || undefined,
            tags: ((feature.tags ?? []) as Array<Record<string, unknown>>).map(
              (t: any) => t.name as string,
            ),
            annotations: {} as Record<string, unknown>,
          },
          scenarios,
          ...(bgChild
            ? {
                background: {
                  steps: (((bgChild.background as Record<string, unknown>).steps ?? []) as any[]).map(
                    (s: any) => extractStep(s),
                  ),
                },
              }
            : {}),
          ...(rules.length > 0 ? { rules } : {}),
          annotations: mapAnnotations(ann),
        }
        const validation = ContractSchema.safeParse(contract)
        if (!validation.success) {
          return JSON.stringify({ success: false, error: `Contract validation failed: ${validation.error.message}` })
        }
        const outputPath = (args.outputPath as string) || `${sourceFile}.contract.json`
        if (fs.existsSync(outputPath) && !args.force) {
          return JSON.stringify({ success: false, error: `Output file already exists: ${outputPath} (use force: true to overwrite)` })
        }
        fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2), "utf-8")
        return JSON.stringify({ success: true, outputPath })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })
}
