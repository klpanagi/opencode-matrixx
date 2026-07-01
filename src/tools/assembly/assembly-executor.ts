import type { AssemblyConfig } from "../../config/schema/assembly"
import type { BackgroundManager } from "../../features/background-agent/manager"
import { DEFAULT_ROUNDS, DEFAULT_VOTERS } from "./constants"
import { selectProviders } from "./provider-selector"
import { synthesizeResults } from "./synthesizer"
import type { AssemblyArgs, SynthesisResult, VoterResult } from "./types"
import { spawnVoters } from "./voter-spawner"

export interface AssemblyExecutorInput {
  manager: BackgroundManager
  args: AssemblyArgs
  config: AssemblyConfig | undefined
  sessionID: string
  messageID: string
}

export interface AssemblyOutput {
  question: string
  voters: VoterResult[]
  rounds: SynthesisResult[]
  finalConsensus: string
}

export async function executeAssembly(
  input: AssemblyExecutorInput,
): Promise<AssemblyOutput> {
  const { manager, args, config, sessionID, messageID } = input

  const voterCount = args.voters ?? config?.default_voters ?? DEFAULT_VOTERS
  const roundCount = args.rounds ?? config?.default_rounds ?? DEFAULT_ROUNDS

  const providers = selectProviders(voterCount, args.models, config)

  let currentVoterResults: VoterResult[] = []
  const synthesisRounds: SynthesisResult[] = []

  for (let round = 0; round < roundCount; round++) {
    if (round === 0) {
      currentVoterResults = await spawnVoters(
        manager,
        args.question,
        providers,
        sessionID,
        messageID,
      )
    }

    const synthesis = await synthesizeResults(
      manager,
      args.question,
      currentVoterResults,
      round + 1,
      sessionID,
      messageID,
    )

    synthesisRounds.push(synthesis)

    if (synthesis.confidence === "high" && round < roundCount - 1) {
      break
    }

    if (round < roundCount - 1) {
      currentVoterResults = currentVoterResults.map((v, i) => ({
        ...v,
        reasoning: `${v.reasoning}\n\n--- Round ${round + 1} Synthesis Feedback ---\n${synthesis.consensus}`,
      }))
    }
  }

  const finalSynthesis = synthesisRounds[synthesisRounds.length - 1]

  return {
    question: args.question,
    voters: currentVoterResults,
    rounds: synthesisRounds,
    finalConsensus: formatFinalConsensus(
      args.question,
      finalSynthesis,
      currentVoterResults,
    ),
  }
}

function formatFinalConsensus(
  question: string,
  final: SynthesisResult,
  voterResults: VoterResult[],
): string {
  const completed = voterResults.filter((v) => v.status === "completed")
  const errored = voterResults.filter((v) => v.status !== "completed")

  let output = `# Assembly Result\n\n`
  output += `**Question**: ${question}\n`
  output += `**Confidence**: ${final.confidence}\n`
  output += `**Voters**: ${completed.length}/${voterResults.length} completed`
  if (errored.length > 0) {
    output += ` (${errored.map((v) => `${v.voterIndex + 1}: ${v.error}`).join(", ")})`
  }
  output += `\n\n## Final Consensus\n\n${final.consensus}\n\n`

  if (final.disagreements.length > 0) {
    output += `## Disagreements\n\n`
    for (const d of final.disagreements) {
      output += `- ${d}\n`
    }
    output += "\n"
  }

  output += `## Per-Voter Reasoning\n\n`
  for (const v of voterResults) {
    output += `### Voter ${v.voterIndex + 1} (${v.modelLabel})\n`
    output += `Status: ${v.status}\n`
    if (v.status === "completed") {
      output += `\n${v.reasoning}\n\n`
    } else {
      output += `Error: ${v.error}\n\n`
    }
  }

  return output
}
