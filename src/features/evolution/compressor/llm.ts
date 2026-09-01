import type { EvolutionCompressorConfig } from "../../../config/schema/evolution";
import type { CompressionInput, DistilledKnowledge, TraceRecord } from "../types";
import type { Compressor } from "./interface";

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}
function mostFrequentTool(traces: TraceRecord[]): string {
  const counts = new Map<string, number>();
  for (const t of traces) counts.set(t.tool, (counts.get(t.tool) ?? 0) + 1);
  let best = traces[0]?.tool ?? "unknown";
  let max = 0;
  for (const [tool, count] of counts) {
    if (count > max) {
      max = count;
      best = tool;
    }
  }
  return best;
}
function buildPrompt(input: CompressionInput, maxChars: number): string {
  const lines: string[] = [];
  lines.push("You are the evolution compressor. Given the TRACE (tool calls + outputs) and session context, extract a reusable workflow.");
  lines.push(`Session: ${input.sessionID}`);
  lines.push(`Traces: ${input.traces.length}`);
  if (input.notepads?.length) lines.push(`Notepads: ${input.notepads.join(" | ").slice(0, 1000)}`);
  lines.push("RULES:");
  lines.push("- Output JSON matching DistilledKnowledge schema.");
  lines.push("- Focus on what WORKED after failures — the final successful path.");
  lines.push("- Omit project-specific secrets/paths.");
  lines.push("- If confidence <0.6, set skillDraft to null.");
  lines.push("TRACES:");
  for (const t of input.traces) {
    const out = truncate(t.output, 500);
    const flag = t.success ? "ok" : `fail:${t.errorType ?? "error"}`;
    lines.push(`- ${t.tool} [${flag}] ${out}`);
  }
  return truncate(lines.join("\n"), maxChars);
}
function parseDistilled(raw: string, fallbackSessionID: string): DistilledKnowledge | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== "string") return null;
  if (typeof obj.summary !== "string") return null;
  if (!Array.isArray(obj.patterns)) return null;
  if (!Array.isArray(obj.pitfalls)) return null;
  if (!Array.isArray(obj.prerequisites)) return null;
  if (typeof obj.confidence !== "number") return null;
  const sourceSessionIDs = Array.isArray(obj.sourceSessionIDs) && obj.sourceSessionIDs.length > 0 ? (obj.sourceSessionIDs as string[]) : [fallbackSessionID];
  return {
    title: obj.title,
    summary: obj.summary,
    patterns: obj.patterns as string[],
    pitfalls: obj.pitfalls as string[],
    prerequisites: obj.prerequisites as string[],
    skillDraft: typeof obj.skillDraft === "string" ? obj.skillDraft : undefined,
    confidence: obj.confidence,
    sourceSessionIDs,
  };
}
export class LlmCompressor implements Compressor {
  private config: EvolutionCompressorConfig;
  private llmCall?: (prompt: string) => Promise<string>;
  constructor(options: { config: EvolutionCompressorConfig; llmCall?: (prompt: string) => Promise<string> }) {
    this.config = options.config;
    this.llmCall = options.llmCall;
  }
  async compress(input: CompressionInput): Promise<DistilledKnowledge> {
    try {
      const minTraces = this.config.minTraces ?? 5;
      if (input.traces.length < minTraces) {
        return {
          title: "insufficient-traces",
          summary: `Only ${input.traces.length} traces`,
          patterns: [],
          pitfalls: [],
          prerequisites: [],
          confidence: 0,
          sourceSessionIDs: [input.sessionID],
        };
      }
      const maxInputTokens = this.config.maxInputTokens ?? 32000;
      const prompt = buildPrompt(input, maxInputTokens);
      if (this.llmCall) {
        try {
          const raw = await this.llmCall(prompt);
          const parsed = parseDistilled(raw, input.sessionID);
          if (parsed) return parsed;
        } catch {}
      }
      const successCount = input.traces.filter((t) => t.success).length;
      const failCount = input.traces.length - successCount;
      const uniqueTools = [...new Set(input.traces.map((t) => t.tool))];
      const successfulTools = [...new Set(input.traces.filter((t) => t.success).map((t) => t.tool))];
      const patterns = successfulTools.map((t) => `Use ${t} successfully`);
      const pitfalls = input.traces.filter((t) => !t.success).map((t) => `${t.errorType ?? "failure"} in ${t.tool}: ${truncate(t.output, 200)}`);
      const prerequisites = uniqueTools;
      const frequent = mostFrequentTool(input.traces);
      const title = `workflow-${frequent}`;
      const summary = `Distilled from ${input.traces.length} tool calls in session ${input.sessionID} with ${successCount} successes and ${failCount} failures.`;
      let confidence = input.traces.length === 0 ? 0 : successCount / input.traces.length;
      if (input.traces.length > 10) confidence = Math.min(0.9, confidence + 0.1);
      if (input.traces.length > 20) confidence = Math.min(0.9, confidence + 0.05);
      confidence = Math.max(0.3, Math.min(0.9, confidence));
      if (failCount === 0 && input.traces.length >= minTraces) confidence = Math.max(confidence, 0.6);
      let skillDraft: string | undefined;
      if (confidence >= 0.6) {
        const workflowSection = patterns.length > 0 ? patterns.join("\n") : "No distinct patterns";
        const pitfallsSection = pitfalls.length > 0 ? pitfalls.join("\n") : "No pitfalls recorded";
        skillDraft = `# ${title}\n\n## Workflow\n${workflowSection}\n\n## Pitfalls\n${pitfallsSection}`;
      }
      return {
        title,
        summary,
        patterns,
        pitfalls,
        prerequisites,
        skillDraft,
        confidence,
        sourceSessionIDs: [input.sessionID],
      };
    } catch {
      return {
        title: "insufficient-traces",
        summary: `Only ${input.traces.length} traces`,
        patterns: [],
        pitfalls: [],
        prerequisites: [],
        confidence: 0,
        sourceSessionIDs: [input.sessionID],
      };
    }
  }
}
