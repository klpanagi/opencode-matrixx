export * from "./interface";
export * from "./llm";

import type { EvolutionCompressorConfig } from "../../../config/schema/evolution";
import type { Compressor, LlmCall } from "./interface";
import { LlmCompressor } from "./llm";

export function createCompressor(config: EvolutionCompressorConfig, llmCall?: LlmCall): Compressor {
  if (config.provider === "dspy-gepa") throw new Error("dspy-gepa provider not yet implemented (comparator unbuilt)");
  return new LlmCompressor({ config, llmCall });
}
