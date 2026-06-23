type SessionModel = { providerID: string; modelID: string }

const sessionModels = new Map<string, SessionModel>()

export function getSessionModel(sessionID: string): SessionModel | undefined {
  return sessionModels.get(sessionID)
}

