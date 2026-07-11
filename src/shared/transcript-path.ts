import { join } from "node:path"
import { getOpenCodeConfigDir } from "./opencode-config-dir"

const TRANSCRIPT_DIR = join(getOpenCodeConfigDir({ binary: "opencode" }), "transcripts")

export function getTranscriptPath(sessionId: string): string {
  return join(TRANSCRIPT_DIR, `${sessionId}.jsonl`)
}
