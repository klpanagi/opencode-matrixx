import type { EventProperties } from "./manager"

export function formatDuration(start: Date, end?: Date): string {
  const duration = (end ?? new Date()).getTime() - start.getTime()
  const seconds = Math.floor(duration / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function getErrorText(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === "object" && error !== null) {
    if ("message" in error && typeof error.message === "string") {
      return error.message
    }
    if ("name" in error && typeof error.name === "string") {
      return error.name
    }
  }
  return ""
}

export function isAbortedSessionError(error: unknown): boolean {
  const message = getErrorText(error)
  return message.toLowerCase().includes("aborted")
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function getSessionErrorMessage(
  properties: EventProperties,
): string | undefined {
  const errorRaw = properties.error
  if (!isRecord(errorRaw)) return undefined

  const dataRaw = errorRaw.data
  if (isRecord(dataRaw)) {
    const message = dataRaw.message
    if (typeof message === "string") return message
  }

  const message = errorRaw.message
  return typeof message === "string" ? message : undefined
}
