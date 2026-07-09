import type { Contract } from "../../features/bdd/schema"
import {
  buildAmbiguitiesSection,
  buildAnnotationsSection,
  buildAssumptionsSection,
  buildBackendMappingSection,
  buildFilesGeneratedSection,
  buildFrontendMappingSection,
  buildTestCoverageSection,
} from "./analysis-report-sections"
import type { BddPipelineResult, BddPipelineStageName } from "./types"

export { stageStatusBadge } from "./analysis-report-sections"

export interface AnalysisReportInput {
  result: BddPipelineResult
  contract: Contract
  featureDir: string
}

const STAGE_ORDER: BddPipelineStageName[] = ["tests", "frontend", "backend"]

function statusBadge(status: BddPipelineResult["status"]): string {
  return status === "PASS" ? "PASS" : "FAIL"
}

function overviewLines(contract: Contract, result: BddPipelineResult): string[] {
  const lines: string[] = []
  const f = contract.feature
  lines.push(`- **Feature name:** ${f.name}`)
  if (f.description) {
    lines.push(`- **Description:** ${f.description}`)
  }
  lines.push(`- **Scenarios:** ${contract.scenarios.length}`)
  if (f.tags.length > 0) {
    lines.push(`- **Tags:** ${f.tags.map((t) => `\`${t}\``).join(", ")}`)
  }
  lines.push(`- **Pipeline status:** ${statusBadge(result.status)}`)
  return lines
}

function header(result: BddPipelineResult, contract: Contract, featureDir: string): string {
  const lines: string[] = []
  lines.push(`# BDD Pipeline Analysis — ${contract.feature.name}`)
  lines.push("")
  lines.push(`- **Status:** ${statusBadge(result.status)}`)
  lines.push(`- **Source feature:** \`${result.sourceFile}\``)
  lines.push(`- **Contract:** \`${result.contractPath}\``)
  lines.push(`- **Output directory:** \`${featureDir}\``)
  lines.push(`- **Started:** ${result.startedAt}`)
  lines.push(`- **Finished:** ${result.finishedAt}`)
  if (result.error) {
    lines.push(`- **Pipeline error:** ${result.error}`)
  }
  lines.push("")
  return lines.join("\n")
}

function overview(contract: Contract, result: BddPipelineResult): string {
  const lines: string[] = []
  lines.push("## Overview")
  lines.push("")
  for (const l of overviewLines(contract, result)) lines.push(l)
  lines.push("")
  return lines.join("\n")
}

function section(title: string, body: string): string {
  return `## ${title}\n\n${body}`
}

export function buildAnalysisReport(input: AnalysisReportInput): string {
  const { result, contract, featureDir } = input

  return [
    header(result, contract, featureDir),
    overview(contract, result),
    section("Contract Annotations", buildAnnotationsSection(contract)),
    section("Frontend Mapping", buildFrontendMappingSection(contract, result.stages.frontend)),
    section("Backend API Mapping", buildBackendMappingSection(contract, result.stages.backend)),
    section("Test Coverage", buildTestCoverageSection(result)),
    section("Assumptions", buildAssumptionsSection(contract)),
    section("Ambiguities & Open Questions", buildAmbiguitiesSection(result)),
    section("Files Generated", buildFilesGeneratedSection(result, featureDir, STAGE_ORDER)),
  ].join("\n")
}
