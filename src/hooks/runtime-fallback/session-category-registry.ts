const registry = new Map<string, string>()

export const SessionCategoryRegistry = {
  register(sessionID: string, category: string): void {
    registry.set(sessionID, category)
  },

  get(sessionID: string): string | undefined {
    return registry.get(sessionID)
  },

  remove(sessionID: string): void {
    registry.delete(sessionID)
  },

  clear(): void {
    registry.clear()
  },
}
