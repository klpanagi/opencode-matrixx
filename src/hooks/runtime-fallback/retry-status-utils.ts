export function normalizeRetryStatusMessage(message: string): string {
  return message.replace(/\d+m\s+\d+s|\d+s|\d+\s+minutes?|\d+\s+hours?|\d+\s+days?|~\d+\s+\w+/gi, "N").trim()
}

export function extractRetryAttempt(statusAttempt: unknown, message: string): string {
  if (typeof statusAttempt === "number") {
    return String(statusAttempt)
  }
  const match = message.match(/attempt\s+#?(\d+)/i)
  return match ? match[1] : "0"
}
