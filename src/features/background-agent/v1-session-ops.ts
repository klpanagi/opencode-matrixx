import type {
  SessionOps,
  SessionOpsCreateInput,
  SessionOpsCreateResult,
  V1CreateSessionFn,
} from "./session-ops"

const DEFAULT_ERROR_PREFIX = "Failed to create background session"
const UNSUPPORTED_ERROR = "operation-not-implemented-by-v1-session-ops"

export interface V1SessionOpsOptions {
  /** Preserves the caller's historical failure wording on the V1 runtime. */
  createErrorPrefix?: string
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Binds the delegation session port to the V1 SDK client so the V1 runtime keeps
 * its exact `session.create` body/query shape and error semantics. Only `create`
 * is routed here; the V1 prompt path still goes through `promptWithModelSuggestionRetry`.
 */
export function createV1SessionOps(
  create: V1CreateSessionFn,
  options: V1SessionOpsOptions = {}
): SessionOps {
  const prefix = options.createErrorPrefix ?? DEFAULT_ERROR_PREFIX
  return {
    create: async (input: SessionOpsCreateInput): Promise<SessionOpsCreateResult> => {
      try {
        const result = await create({
          body: { parentID: input.parentSessionID, title: input.title },
          query: { directory: input.directory },
        })
        if (result.error) {
          return { ok: false, error: `${prefix}: ${result.error}` }
        }
        if (!result.data?.id) {
          return { ok: false, error: `${prefix}: API returned no session ID` }
        }
        return { ok: true, sessionID: result.data.id }
      } catch (error) {
        return { ok: false, error: toErrorMessage(error) }
      }
    },
    prompt: async () => ({ ok: false, error: UNSUPPORTED_ERROR }),
    fork: async () => ({ ok: false, error: UNSUPPORTED_ERROR }),
    move: async () => ({ ok: false, error: UNSUPPORTED_ERROR }),
  }
}
