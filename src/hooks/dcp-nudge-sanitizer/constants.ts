// Data-driven markers that identify DCP-injected sticky nudge / compressed-block text.
// The sanitizer never branches on a model name — it only matches these generic markers.
export const NUDGE_MARKERS: RegExp[] = [
  /<instruction\s+name=iteration_nudge>/i,
  /compressed block context:/i,
  /\(b\d+\)/,
]

// Collapse duplicate internal whitespace and strip the surrounding whitespace of a
// kept nudge part. Non-nudge parts are never rewritten.
export function normalizeNudgeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
