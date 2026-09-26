import {
  FORK_UNAVAILABLE_ERROR,
  type SessionOps,
  type SessionOpsCreateInput,
  type SessionOpsCreateResult,
  type SessionOpsMoveInput,
  type SessionOpsPromptInput,
  type SessionOpsVoidResult,
  SUBAGENT_METADATA_KEY,
  type V2CreateArgs,
  type V2MoveArgs,
  type V2PromptArgs,
  type V2SessionSource,
} from "./session-ops"

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * V2 has no `parentID` on `SessionCreateInput` — parent linkage is server-owned
 * (`Session.Info.parentID`) and reachable in-plugin only through a fork, which the
 * V2 session domain does not expose. The parent id therefore travels as metadata
 * so a reconciled handle can still attribute the session.
 */
function toV2CreateArgs(input: SessionOpsCreateInput): V2CreateArgs {
  return {
    title: input.title,
    agent: input.agent,
    location: { directory: input.directory },
    metadata: {
      [SUBAGENT_METADATA_KEY]: input.subagent,
      "matrixx.parentSessionID": input.parentSessionID,
    },
  } as V2CreateArgs
}

function toV2PromptArgs(input: SessionOpsPromptInput): V2PromptArgs {
  return {
    sessionID: input.sessionID,
    text: input.text,
    delivery: input.delivery,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  } as V2PromptArgs
}

function toV2MoveArgs(input: SessionOpsMoveInput): V2MoveArgs {
  return {
    sessionID: input.sessionID,
    directory: input.directory,
    delivery: input.delivery,
  } as V2MoveArgs
}

/**
 * Binds the delegation session port to the V2 session domain: parallel sessions
 * are created with `session.create`, instructed with `session.prompt` carrying an
 * explicit `delivery` (queue for a launch prompt, steer for a mid-flight change),
 * and relocated to a worktree with `session.move`.
 */
export function createV2SessionOps(session: V2SessionSource): SessionOps {
  return {
    create: async (input: SessionOpsCreateInput): Promise<SessionOpsCreateResult> => {
      try {
        const info = await session.create(toV2CreateArgs(input))
        if (!info?.id) {
          return { ok: false, error: "Failed to create background session: API returned no session ID" }
        }
        return { ok: true, sessionID: info.id }
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) }
      }
    },

    prompt: async (input: SessionOpsPromptInput): Promise<SessionOpsVoidResult> => {
      try {
        if (input.agent) {
          await session.switchAgent({ sessionID: input.sessionID, agent: input.agent })
        }
        await session.prompt(toV2PromptArgs(input))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) }
      }
    },

    fork: async () => ({ ok: false, error: FORK_UNAVAILABLE_ERROR }),

    move: async (input: SessionOpsMoveInput): Promise<SessionOpsVoidResult> => {
      try {
        await session.move(toV2MoveArgs(input))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) }
      }
    },
  }
}
