import {
  DEFAULT_STEERING_DELIVERY,
  type SessionSteering,
  type SteeringRequest,
} from "./types"

/** The V2 in-plugin session domain members steering needs. */
export interface V2SteeringSource {
  switchAgent(args: { sessionID: string; agent: string }): Promise<unknown>
  switchModel(args: { sessionID: string; model: { providerID: string; modelID: string } }): Promise<unknown>
  prompt(args: { sessionID: string; text: string; delivery: "steer" | "queue" }): Promise<unknown>
}

/**
 * Binds the steering port to the V2 session domain. V2 has no agent/model on the
 * prompt body, so the continuation's original agent and model are re-applied via
 * `switchAgent`/`switchModel` before the prompt is delivered. `directory` has no
 * V2 equivalent on this call — the session already carries its own location.
 */
export function createV2SessionSteering(session: V2SteeringSource): SessionSteering {
  return {
    runtime: "v2",
    deliver: async (request: SteeringRequest): Promise<void> => {
      if (request.agent !== undefined) {
        await session.switchAgent({ sessionID: request.sessionID, agent: request.agent })
      }
      if (request.model !== undefined) {
        await session.switchModel({ sessionID: request.sessionID, model: request.model })
      }
      await session.prompt({
        sessionID: request.sessionID,
        text: request.text,
        delivery: request.delivery ?? DEFAULT_STEERING_DELIVERY,
      })
    },
  }
}
