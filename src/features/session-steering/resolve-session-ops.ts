import type { PluginContextSlice } from "../../plugin/types"
import type {
  SessionOps,
  V1CreateArgs,
  V1CreateSessionFn,
} from "../background-agent/session-ops"
import { createV1SessionOps } from "../background-agent/v1-session-ops"

/**
 * Resolution point for child-session lifecycle, reusing the Wave 8.1 `SessionOps`
 * seam rather than a second session abstraction. Only the V1 SDK client carries a
 * session transport today; the V2 `Context["session"]` branch belongs here.
 */
export function resolveSessionOps(ctx: PluginContextSlice<"client">): SessionOps {
  const create: V1CreateSessionFn = async (args: V1CreateArgs) => {
    const result = await ctx.client.session.create(args)
    return { data: result.data, error: result.error }
  }
  return createV1SessionOps(create, { createErrorPrefix: "Verification session creation failed" })
}
