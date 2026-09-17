import { readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createContentHash, isDuplicateByContentHash } from "../rules-injector/matcher";
import { parseRuleFrontmatter } from "../rules-injector/parser";
import type { UnifiedTruncator } from "./injector";

export type RulesCache = { contentHashes: Set<string>; realPaths: Set<string> };

export async function readAgentsSection(
  agentsPath: string,
  sessionID: string,
  truncator: UnifiedTruncator,
): Promise<string | null> {
  const exists = await access(agentsPath).then(() => true).catch(() => false);
  if (!exists) return null;
  try {
    const content = await readFile(agentsPath, "utf-8");
    const { result, truncated } = await truncator.truncate(sessionID, content);
    const notice = truncated
      ? `\n\n[Note: Content was truncated to save context window space. For full context, please read the file directly: ${agentsPath}]`
      : "";
    return `[Directory Context: ${agentsPath}]\n${result}${notice}`;
  } catch {
    return null;
  }
}

export async function readRuleSection(
  candidate: string,
  rel: string,
  reason: string,
  sessionID: string,
  truncator: UnifiedTruncator,
  rulesCache: RulesCache,
): Promise<string | null> {
  try {
    const raw = readFileSync(candidate, "utf-8");
    const { body } = parseRuleFrontmatter(raw);
    const hash = createContentHash(body);
    if (isDuplicateByContentHash(hash, rulesCache.contentHashes)) return null;
    const { result, truncated } = await truncator.truncate(sessionID, body);
    const notice = truncated
      ? `\n\n[Note: Content was truncated to save context window space. For full context, please read the file directly: ${rel}]`
      : "";
    rulesCache.contentHashes.add(hash);
    return `[Rule: ${rel}]\n[Match: ${reason}]\n${result}${notice}`;
  } catch {
    return null;
  }
}
