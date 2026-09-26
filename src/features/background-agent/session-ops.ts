import type { V2PluginContext } from "../../plugin/types"

/** The V2 in-plugin session domain (`Context["session"]`). */
export type V2SessionDomain = V2PluginContext["session"]

export type V2CreateArgs = Parameters<V2SessionDomain["create"]>[0]
export type V2PromptArgs = Parameters<V2SessionDomain["prompt"]>[0]
export type V2MoveArgs = Parameters<V2SessionDomain["move"]>[0]
export type V2SwitchAgentArgs = Parameters<V2SessionDomain["switchAgent"]>[0]

/** The V2 inbox delivery modes (`SessionInbox.Delivery`). */
export type SessionDelivery = "steer" | "queue"

/** Metadata key recording that a session was launched as a managed subagent. */
export const SUBAGENT_METADATA_KEY = "matrixx.subagent"

/** The error returned when the runtime has no `fork` member (V2 in-plugin domain). */
/** Delegation always launches with `subagent: true` so V2 auto-backgrounds it. */
export const SUBAGENT_AUTO_BACKGROUND = { subagent: true } as const

export const FORK_UNAVAILABLE_ERROR = "fork-unavailable-on-v2-session-domain"

/** The slice of the V2 session domain the delegation core actually needs. */
export interface V2SessionSource {
  create(args: V2CreateArgs): Promise<{ id: string }>
  switchAgent(args: V2SwitchAgentArgs): Promise<unknown>
  prompt(args: V2PromptArgs): Promise<unknown>
  move(args: V2MoveArgs): Promise<unknown>
}

/** The V1 `session.create` call shape the delegation core used pre-migration. */
export interface V1CreateArgs {
  body: { parentID: string; title: string }
  query: { directory: string }
}

export type V1CreateSessionFn = (
  args: V1CreateArgs
) => Promise<{ data?: { id?: string } | undefined; error?: unknown }>

export interface SubagentSessionRequest {
  description: string
  agent: string
  parentSessionID: string
  directory: string
  /** Delegation always opts in: `subagent: true` — V2 auto-backgrounds the session. */
  subagent?: boolean
}

export interface SessionOpsCreateInput extends SubagentSessionRequest {
  title: string
  subagent: boolean
}

export interface SessionOpsPromptInput {
  sessionID: string
  text: string
  delivery: SessionDelivery
  agent?: string
  metadata?: Record<string, unknown>
}

export interface SessionOpsForkInput {
  sessionID: string
  before?: string
}

export interface SessionOpsMoveInput {
  sessionID: string
  directory: string
  delivery: SessionDelivery
}

export type SessionOpsCreateResult = { ok: true; sessionID: string } | { ok: false; error: string }
export type SessionOpsVoidResult = { ok: true } | { ok: false; error: string }

export interface SessionOps {
  create(input: SessionOpsCreateInput): Promise<SessionOpsCreateResult>
  prompt(input: SessionOpsPromptInput): Promise<SessionOpsVoidResult>
  fork(input: SessionOpsForkInput): Promise<SessionOpsCreateResult>
  move(input: SessionOpsMoveInput): Promise<SessionOpsVoidResult>
}

export function buildSubagentTitle(description: string, agent: string): string {
  return `${description} (@${agent} subagent)`
}

export function buildSubagentSessionCreate(request: SubagentSessionRequest): SessionOpsCreateInput {
  return {
    ...request,
    subagent: request.subagent ?? SUBAGENT_AUTO_BACKGROUND.subagent,
    title: buildSubagentTitle(request.description, request.agent),
  }
}
export function buildQueuePrompt(
  sessionID: string,
  text: string,
  agent?: string
): SessionOpsPromptInput {
  return { sessionID, text, delivery: "queue", ...(agent ? { agent } : {}) }
}

export function buildSteerPrompt(sessionID: string, text: string): SessionOpsPromptInput {
  return { sessionID, text, delivery: "steer" }
}

export function buildForkRequest(sessionID: string, before?: string): SessionOpsForkInput {
  return { sessionID, ...(before ? { before } : {}) }
}

export function buildMoveRequest(
  sessionID: string,
  directory: string,
  delivery: SessionDelivery
): SessionOpsMoveInput {
  return { sessionID, directory, delivery }
}

export function isSubagentAutoBackground(input: { subagent?: boolean }): boolean {
  return input.subagent === true
}
