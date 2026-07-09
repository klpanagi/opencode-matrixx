export interface BddParseGherkinArgs {
  filePath: string;
  includeSourceMap?: boolean;
}

export interface BddParseGherkinResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}
