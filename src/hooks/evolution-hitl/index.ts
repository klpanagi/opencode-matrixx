import type { Message, Part } from "@opencode-ai/sdk"
import type { EvolutionConfig } from "../../config/schema/evolution"
import { traceStore } from "../../features/evolution/store"
import { EvolutionWriter } from "../../features/evolution/writer"
import { log } from "../../shared/logger"
import { createSystemDirective } from "../../shared/system-directive"

type MessageWithParts = {
  info: Message
  parts: Part[]
}

type TransformOutput = { messages: MessageWithParts[] }

function resolveConfig(a?: unknown, b?: unknown): EvolutionConfig | undefined {
  if (b && typeof b === "object" && "enabled" in (b as Record<string, unknown>)) return b as EvolutionConfig
  if (a && typeof a === "object" && "enabled" in (a as Record<string, unknown>)) return a as EvolutionConfig
  return undefined
}

export function createEvolutionHitlHook(a?: unknown, b?: unknown) {
  const config = resolveConfig(a, b)

  return {
    "experimental.chat.messages.transform": async (_input: Record<string, never>, output: TransformOutput): Promise<void> => {
      try {
        if (!config?.enabled) return
        if (!config.governance?.requireApproval) return
        const state = await traceStore.getState()
        if (state.lastPromptAt) {
          const elapsed = Date.now() - new Date(state.lastPromptAt).getTime()
          if (!Number.isNaN(elapsed) && elapsed < 60 * 60 * 1000) return
        }
        let pending: string[] = []
        try {
          const writer = new EvolutionWriter(config.writer)
          pending = await writer.listPending()
        } catch {
          return
        }
        if (pending.length === 0) return
        const slug = pending[0]
        const directive = createSystemDirective("EVOLUTION REVIEW")
        const content = `${directive}\n\n🧬 Evolution ready for review: ${slug} (${pending.length} pending). Preview: .matrixx/evolution/pending/${slug}.md\nRun /evolution approve ${slug} | /evolution reject ${slug} | /evolution list`
        const messages = output.messages
        if (!messages || messages.length === 0) return
        let lastUserIndex = -1
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].info.role === "user") {
            lastUserIndex = i
            break
          }
        }
        if (lastUserIndex === -1) return
        const lastUser = messages[lastUserIndex]
        const textIndex = lastUser.parts.findIndex((p) => p.type === "text" && typeof (p as { text?: string }).text === "string")
        if (textIndex === -1) {
          lastUser.parts.push({
            type: "text",
            text: content,
            id: `evolution_hitl_${Date.now()}`,
            messageID: lastUser.info.id,
            sessionID: (lastUser.info as { sessionID?: string }).sessionID ?? "",
          } as Part)
        } else {
          const part = lastUser.parts[textIndex] as { text: string }
          part.text = `${part.text}\n\n${content}`
        }
        await traceStore.updateState({ lastPromptAt: new Date().toISOString() })
        log("[evolution-hitl] injected pending review prompt", { slug, pendingCount: pending.length })
      } catch {}
    },
  }
}
