import { isRecord } from "../../shared/record-type-guard"
export function formatMessageTime(value: unknown): string {
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  if (isRecord(value)) {
    if ("created" in value) {
      const created = (value as { created?: number }).created
      if (typeof created === "number") {
        return new Date(created).toISOString()
      }
    }
  }
  return "Unknown time"
}
