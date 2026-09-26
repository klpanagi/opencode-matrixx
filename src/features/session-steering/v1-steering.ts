import type { SessionSteering, SteeringRequest } from "./types"

type V1PromptBody = {
  agent?: string
  model?: { providerID: string; modelID: string }
  parts: Array<{ type: "text"; text: string }>
}

type V1PromptArgs = {
  path: { id: string }
  body: V1PromptBody
  query: { directory: string }
}

/** The V1 SDK client slice the continuation injectors need. */
export interface V1SteeringSource {
  session: {
    promptAsync(args: V1PromptArgs): Promise<unknown>
    prompt(args: V1PromptArgs): Promise<unknown>
  }
}

function toPromptArgs(request: SteeringRequest): V1PromptArgs {
  return {
    path: { id: request.sessionID },
    body: {
      ...(request.agent !== undefined ? { agent: request.agent } : {}),
      ...(request.model !== undefined ? { model: request.model } : {}),
      parts: [{ type: "text", text: request.text }],
    },
    query: { directory: request.directory },
  }
}

/**
 * Binds the steering port to the V1 SDK client. V1 has no delivery modes, so
 * `delivery` is not projected onto the wire; `awaitCompletion` instead selects the
 * blocking `session.prompt` over the fire-and-forget `session.promptAsync`.
 */
export function createV1SessionSteering(client: V1SteeringSource): SessionSteering {
  return {
    runtime: "v1",
    deliver: async (request: SteeringRequest): Promise<void> => {
      const send = request.awaitCompletion ? client.session.prompt : client.session.promptAsync
      await send.call(client.session, toPromptArgs(request))
    },
  }
}
