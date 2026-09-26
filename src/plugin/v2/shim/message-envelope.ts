import { V2ShimProtocolError } from "./protocol"

/**
 * The V1 message envelope Matrixx consumers read. Kept structurally identical to
 * the shape `features/background-agent/session-output.ts` and
 * `feature/hook-message-injector` already depend on, so no call site changes.
 */
export type V1MessagePart = {
  type?: string
  text?: string
  content?: string | unknown[]
  [key: string]: unknown
}

export type V1Message = {
  info?: { role?: string; error?: unknown; id?: string; [key: string]: unknown }
  parts?: V1MessagePart[]
}

type V2Record = Record<string, unknown>

/**
 * V2 models a message as a flat, discriminated union whose `content` lives
 * inside the variant. V1 models it as `{ info, parts }` with content as a
 * sibling array. This reconstructs the V1 envelope from the V2 variant.
 *
 * Provenance: derived from the published `@opencode/client` type surface
 * (`SessionMessageInfo` and its eleven variants), not from a live observation of
 * every variant. The `idle` variant is the one shape actually observed against a
 * running V2 server (see `docs/v2-smoke.md`); the rest follow the declared
 * schema. Because the union is closed, an unrecognised `type` means the V2
 * schema has diverged from this mapping, and it throws rather than guessing.
 */
const ROLE_BY_TYPE: Readonly<Record<string, string>> = {
  user: "user",
  synthetic: "user",
  system: "system",
  skill: "user",
  assistant: "assistant",
  shell: "tool",
  idle: "system",
  compaction: "system",
  "agent-switched": "system",
  "model-switched": "system",
  "location-switched": "system",
}

function asRecord(value: unknown): V2Record {
  return value !== null && typeof value === "object" ? (value as V2Record) : {}
}

function textPart(text: unknown): V1MessagePart[] {
  return typeof text === "string" ? [{ type: "text", text }] : []
}

/** V2 assistant `content` blocks already carry V1-compatible part discriminants. */
function assistantParts(message: V2Record): V1MessagePart[] {
  const content = message.content
  if (!Array.isArray(content)) return []
  return content.map((block) => {
    const record = asRecord(block)
    const type = typeof record.type === "string" ? record.type : "unknown"
    if (type === "tool") {
      return { ...record, type: "tool", tool: record.name, state: record.state }
    }
    return { ...record, type }
  })
}

function partsFor(message: V2Record, type: string): V1MessagePart[] {
  switch (type) {
    case "assistant":
      return assistantParts(message)
    case "user":
    case "system":
    case "synthetic":
    case "skill":
      return textPart(message.text)
    case "shell": {
      const output = asRecord(message.output).output
      return [
        { type: "tool", tool: "shell" },
        { type: "tool_result", content: typeof output === "string" ? output : "" },
      ]
    }
    case "compaction":
      return textPart(message.summary)
    default:
      // Idle and the three selection notices carry no textual content in V2.
      return []
  }
}

function toV1Message(message: unknown, index: number): V1Message {
  const record = asRecord(message)
  const type = record.type

  if (typeof type !== "string" || !(type in ROLE_BY_TYPE)) {
    throw new V2ShimProtocolError(
      "session.messages",
      "n/a",
      "application/json",
      `message[${index}] has unrecognised type ${JSON.stringify(type)}. The V2 message union has changed, ` +
        `so the V1 {info, parts} envelope cannot be reconstructed without guessing.`,
    )
  }

  return {
    info: {
      ...record,
      id: typeof record.id === "string" ? record.id : undefined,
      role: ROLE_BY_TYPE[type],
      error: record.error,
    },
    parts: partsFor(record, type),
  }
}

/**
 * Reconstructs the V1 `{ info, parts }` envelope from a V2 `Message[]`.
 *
 * Throws on an unrecognised message rather than dropping it, so a schema
 * divergence is visible instead of quietly shortening the history.
 */
export function toV1MessageEnvelope(messages: unknown, member = "session.messages"): V1Message[] {
  if (!Array.isArray(messages)) {
    throw new V2ShimProtocolError(member, "n/a", "application/json", `expected an array of messages, got ${typeof messages}`)
  }
  return messages.map(toV1Message)
}
