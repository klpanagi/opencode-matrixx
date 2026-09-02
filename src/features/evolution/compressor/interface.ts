import type { CompressionInput, DistilledKnowledge } from "../types";

export interface Compressor {
  compress(input: CompressionInput): Promise<DistilledKnowledge>;
}

export type { CompressionInput, DistilledKnowledge, TraceRecord } from "../types";
