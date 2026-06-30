import { z } from "zod"

export const ConsensusArgsSchema = z.object({
  question: z.string().min(1).describe("The question or decision to reach consensus on"),
  voters: z
    .number()
    .int()
    .min(2)
    .max(5)
    .optional()
    .describe("Number of voters (default: 3)"),
  rounds: z
    .number()
    .int()
    .min(1)
    .max(3)
    .optional()
    .describe("Number of synthesis rounds (default: 2)"),
  models: z
    .array(z.string())
    .optional()
    .describe(
      "Override auto-selected models (e.g., ['anthropic:claude-sonnet-4-20250514', 'openai:gpt-4o'])",
    ),
})

export type ConsensusArgs = z.infer<typeof ConsensusArgsSchema>

export interface VoterResult {
  voterIndex: number
  modelLabel: string
  reasoning: string
  status: "completed" | "error" | "timeout"
  error?: string
}

export interface SynthesisResult {
  round: number
  consensus: string
  confidence: "high" | "medium" | "low"
  disagreements: string[]
}

export interface ProviderModel {
  providerID: string
  modelID: string
}
