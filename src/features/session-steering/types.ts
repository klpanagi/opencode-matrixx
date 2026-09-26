/** How a queued prompt reaches a live V2 session: interrupt it mid-flight, or append after the turn. */
export type SteeringDelivery = "steer" | "queue"

export interface SteeringModelRef {
  providerID: string
  modelID: string
}

export interface SteeringRequest {
  sessionID: string
  text: string
  directory: string
  delivery?: SteeringDelivery
  agent?: string
  model?: SteeringModelRef
  /** Resolve only once the session has produced its turn. Maps to V1's blocking `session.prompt`; V2 already awaits. */
  awaitCompletion?: boolean
}

export interface SessionSteering {
  readonly runtime: "v1" | "v2"
  deliver(request: SteeringRequest): Promise<void>
}

export const DEFAULT_STEERING_DELIVERY: SteeringDelivery = "steer"
