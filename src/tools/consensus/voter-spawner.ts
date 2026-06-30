import type { BackgroundManager } from "../../features/background-agent/manager"
import { POLL_INTERVAL_MS, VOTER_TIMEOUT_MS } from "./constants"
import type { ProviderModel, VoterResult } from "./types"

export async function spawnVoters(
  manager: BackgroundManager,
  question: string,
  providers: ProviderModel[],
  parentSessionID: string,
  parentMessageID: string,
): Promise<VoterResult[]> {
  const tasks = providers.map((provider, index) =>
    manager.launch({
      description: `Consensus voter ${index + 1}`,
      prompt: `You are voter #${index + 1} in a multi-model consensus process. Analyze the following question independently and provide your reasoning. Be thorough and consider multiple angles.

Question: ${question}

Output your analysis in this format:
## Reasoning
[Your detailed step-by-step reasoning]

## Conclusion
[Your final answer/conclusion]

## Confidence
[High/Medium/Low - with justification]`,
      agent: "mouse",
      parentSessionID,
      parentMessageID,
      model: {
        providerID: provider.providerID,
        modelID: provider.modelID,
        temperature: 0.3,
      },
    }),
  )

  const launchedTasks = await Promise.all(tasks)

  const results = await Promise.all(
    launchedTasks.map(async (task, index) => {
      const provider = providers[index]
      const deadline = Date.now() + VOTER_TIMEOUT_MS

      while (Date.now() < deadline) {
        const current = manager.getTask(task.id)
        if (!current) break

        if (current.status === "completed") {
          return {
            voterIndex: index,
            modelLabel: `${provider.providerID}:${provider.modelID}`,
            reasoning: current.result ?? "",
            status: "completed" as const,
          }
        }

        if (current.status === "error") {
          return {
            voterIndex: index,
            modelLabel: `${provider.providerID}:${provider.modelID}`,
            reasoning: "",
            status: "error" as const,
            error: current.error ?? "Unknown error",
          }
        }

        if (
          current.status === "cancelled" ||
          current.status === "interrupt"
        ) {
          return {
            voterIndex: index,
            modelLabel: `${provider.providerID}:${provider.modelID}`,
            reasoning: "",
            status: "error" as const,
            error: `Voter ${index + 1} was ${current.status}`,
          }
        }

        await delay(POLL_INTERVAL_MS)
      }

      return {
        voterIndex: index,
        modelLabel: `${provider.providerID}:${provider.modelID}`,
        reasoning: "",
        status: "timeout" as const,
        error: `Voter ${index + 1} timed out after ${VOTER_TIMEOUT_MS}ms`,
      }
    }),
  )

  return results
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
