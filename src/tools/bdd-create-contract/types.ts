export interface BddCreateContractArgs {
  parsedAst: string
  sourceFile: string
  sourceText: string
  force?: boolean
  outputPath?: string
}

export interface BddCreateContractResult {
  success: boolean
  outputPath?: string
  error?: string
}
