import { isRecord } from "../../shared/record-type-guard"
import type { EventProperties } from "./manager"


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
