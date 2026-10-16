export interface CompactionSourceBytes {
  injector: number
  plan: number
  evolution: number
}

export interface CompactionAppendSummary {
  addedBytes: number
  sources: CompactionSourceBytes
}

export function utf8ByteLength(fragment: string | undefined | null): number {
  if (!fragment) {
    return 0
  }
  return Buffer.byteLength(fragment, "utf8")
}

export function summarizeCompactionAppend(sources: CompactionSourceBytes): CompactionAppendSummary {
  const addedBytes = sources.injector + sources.plan + sources.evolution
  return { addedBytes, sources: { ...sources } }
}

export function formatCompactionAppendLog(
  sessionID: string,
  sources: CompactionSourceBytes,
): string {
  const { addedBytes } = summarizeCompactionAppend(sources)
  return (
    `Matrixx appended ${addedBytes} bytes to compaction context ` +
    `(session ${sessionID}; injector ${sources.injector}B, plan ${sources.plan}B, ` +
    `evolution ${sources.evolution}B); host truncation not performed by Matrixx`
  )
}
