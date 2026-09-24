import type { createOpencodeClient } from "@opencode-ai/sdk"
import type { LlmUsage } from "../../features/evolution/compressor/interface"
import { log } from "../../shared/logger"
import { normalizeSDKResponse } from "../../shared/normalize-sdk-response"
import { isRecord } from "../../shared/record-type-guard"
import { parseModelString } from "../../tools/delegate-task/model-string-parser"

type Client = ReturnType<typeof createOpencodeClient>

type SessionMessage = { info?: { role?: string; time?: { created?: number } }; parts?: unknown }

type TextPart = { type: "text"; text: string }

function latestAssistantText(messages: unknown): string | null {
  const list = normalizeSDKResponse<SessionMessage[]>(messages, [])
  if (!Array.isArray(list) || list.length === 0) return null
  const assistants = list.filter((m) => isRecord(m) && isRecord(m.info) && m.info.role === "assistant")
  assistants.sort((a, b) => Number(b.info?.time?.created ?? 0) - Number(a.info?.time?.created ?? 0))
  const latest = assistants[0]
  if (!latest || !Array.isArray(latest.parts)) return null
  const text = latest.parts
    .filter((p): p is TextPart => isRecord(p) && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
  return text.length > 0 ? text : null
}

export function parseModelOverride(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  return parseModelString(model)
}

export function createHostLlmCall(options: {
  client: Client
  directory: string
  agent?: string
  model?: string
}): (prompt: string, model?: string) => Promise<{ text: string; usage?: LlmUsage }> {
  const { client, directory, agent, model: defaultModel } = options
  return async (prompt: string, model?: string) => {
    const effectiveModel = model ?? defaultModel
    const parsed = parseModelOverride(effectiveModel)
    const created = await client.session.create({
      body: { title: "evolution-compressor" },
      query: { directory },
    })
    const session = normalizeSDKResponse<{ id: string }>(created, { id: "" })
    if (!session.id) throw new Error("evolution-compressor: host session create failed")
    try {
      await client.session.prompt({
        path: { id: session.id },
        body: {
          ...(agent ? { agent } : {}),
          ...(parsed ? { model: parsed } : {}),
          parts: [{ type: "text", text: prompt }],
        },
        query: { directory },
      })
    } catch (error) {
      log("[evolution-compressor] host prompt failed", { error: String(error) })
      throw error instanceof Error ? error : new Error(String(error))
    }
    const messages = await client.session.messages({ path: { id: session.id } })
    const text = latestAssistantText(messages)
    if (!text) throw new Error("evolution-compressor: host returned no assistant text")
    return { text }
  }
}
