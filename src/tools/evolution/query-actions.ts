// Per-file budget: ≤200 LOC (T9 retrieval handlers split from tools.ts).
import {
  readRetrievalRecords,
  resolveProjectIdentity,
  searchRecords,
  truncateContext,
} from "../../features/evolution/store";
import { GET_CONTEXT_CHAR_CAP, NO_RETRIEVABLE_MESSAGE, SEARCH_RESULT_LIMIT } from "./constants";
import type { EvolutionToolArgs } from "./types";

function retrievalScope(projectRoot: string, kind?: EvolutionToolArgs["kind"]) {
  return {
    projectId: resolveProjectIdentity(projectRoot).projectId,
    kinds: kind ? [kind] : undefined,
  };
}

export function handleSearch(projectRoot: string, args: EvolutionToolArgs): string {
  const hits = searchRecords(readRetrievalRecords(projectRoot), {
    query: args.query,
    scope: retrievalScope(projectRoot, args.kind),
  }).slice(0, SEARCH_RESULT_LIMIT);
  if (hits.length === 0) return NO_RETRIEVABLE_MESSAGE;
  const lines = hits.map((hit) => `- ${hit.id} (kind: ${hit.meta.kind ?? "unknown"})`);
  return `Retrievable knowledge (${hits.length}):\n${lines.join("\n")}`;
}

export function handleGetContext(projectRoot: string, args: EvolutionToolArgs): string {
  const hits = searchRecords(readRetrievalRecords(projectRoot), {
    query: args.query,
    scope: retrievalScope(projectRoot, args.kind),
  });
  if (hits.length === 0) return NO_RETRIEVABLE_MESSAGE;
  const body = hits.map((hit) => `## ${hit.id}\n${hit.text}`).join("\n\n");
  return truncateContext(body, GET_CONTEXT_CHAR_CAP);
}
