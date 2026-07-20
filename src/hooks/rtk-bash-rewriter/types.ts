export interface RtkRewriteResult {
  success: boolean
  rewrittenCommand?: string
  exitCode: number
  error?: string
}

export interface RtkBinaryStatus {
  available: boolean
  path: string | null
  checkedAt: number
}
