import type { PluginContextSlice } from "../../plugin/types"
import type { SessionSteering } from "./types"
import { createV1SessionSteering } from "./v1-steering"

/**
 * The single resolution point for continuation steering. Today the V1 SDK client is
 * the only context that carries a session transport; once the V1→V2 context adapter
 * lands, a `Context["session"]` branch here is the one place that has to change.
 */
export function resolveSessionSteering(ctx: PluginContextSlice<"client">): SessionSteering {
  return createV1SessionSteering(ctx.client)
}
