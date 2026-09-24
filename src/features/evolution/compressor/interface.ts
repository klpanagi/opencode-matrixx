import type { CompressionUsage, CompressResult } from "../types";

export type { Compressor } from "../types";
export type LlmUsage = CompressionUsage;
export type LlmResponse = { text: string; usage?: LlmUsage };
export type LlmCall = (prompt: string, model?: string) => Promise<string | LlmResponse>;
export type CompressionResult = CompressResult;
export type { CompressionInput, DistilledKnowledge, TraceRecord } from "../types";
