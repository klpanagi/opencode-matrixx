export * from "./interface";
export * from "./llm";

import type { EvolutionCompressorConfig } from "../../../config/schema/evolution";
import type { Compressor } from "./interface";
import { LlmCompressor } from "./llm";

export function createCompressor(config: EvolutionCompressorConfig, llmCall?: (prompt: string) => Promise<string>): Compressor {
  if (config.provider === "dspy-gepa") throw new Error("dspy-gepa not yet implemented");
  return new LlmCompressor({ config, llmCall });
}
