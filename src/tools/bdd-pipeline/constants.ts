export const BDD_PIPELINE_TOOL_NAME = "bdd_pipeline_run"

export const BDD_PIPELINE_DESCRIPTION =
  "Run the full BDD pipeline (parse -> contract -> enrich -> 3 parallel subagents " +
  "(tests/frontend/backend) -> gate -> ANALYSIS.md) for one or more .feature files. " +
  "Enforces a deterministic 3-stage subagent plan in fixed order."

export const PIPELINE_REQUIRED_OUTPUTS = [
  "ANALYSIS.md",
  "cucumber.cjs",
  "run-tests.sh",
] as const

export const PIPELINE_STAGES = ["tests", "frontend", "backend"] as const
