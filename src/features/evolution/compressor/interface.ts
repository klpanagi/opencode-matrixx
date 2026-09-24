import type { CompressionInput, CompressionUsage, CompressResult } from "../types";

export type LlmUsage = CompressionUsage;
export type LlmResponse = { text: string; usage?: LlmUsage };
export type LlmCall = (prompt: string, model?: string) => Promise<string | LlmResponse>;
export type CompressionResult = CompressResult;

// Normative compressor contract for D1. Shapes live in
// src/features/evolution/types.ts (single source); the duplicate Compressor
// interface there is unified by T4a, whose scope lists "compressor interface".
export interface Compressor {
  compress(input: CompressionInput): Promise<CompressionResult>;
}

export type { CompressionInput, DistilledKnowledge, TraceRecord } from "../types";
