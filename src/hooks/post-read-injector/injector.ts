import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { AGENTS_FILENAME } from "../directory-agents-injector/constants";
import {
  loadInjectedPaths,
  saveInjectedPaths,
} from "../directory-agents-injector/storage";
import { PROJECT_RULE_FILES, PROJECT_RULE_SUBDIRS } from "../rules-injector/constants";
import {
  isDuplicateByRealPath,
  shouldApplyRule,
} from "../rules-injector/matcher";
import { parseRuleFrontmatter } from "../rules-injector/parser";
import { findProjectRoot } from "../rules-injector/project-root-finder";
import {
  findRuleFilesRecursive,
  safeRealpathSync,
} from "../rules-injector/rule-file-scanner";
import {
  loadInjectedRules,
  saveInjectedRules,
} from "../rules-injector/storage";
import { buildDirectoryContextBlock } from "./block";
import { DIRECTORY_CONTEXT_HEADER } from "./constants";
import type { RulesCache } from "./sections";
import { readAgentsSection, readRuleSection } from "./sections";
import { collectAncestorDirs } from "./unified-walk";

export type UnifiedTruncator = {
  truncate: (
    sessionID: string,
    content: string,
  ) => Promise<{ result: string; truncated: boolean }>;
};

function resolveUnifiedFilePath(rootDirectory: string, filePath: string): string | null {
  if (!filePath) return null;
  if (filePath.startsWith("/")) return filePath;
  return resolve(rootDirectory, filePath);
}

export function createUnifiedPostReadProcessor(deps: {
  workspaceDirectory: string;
  truncator: UnifiedTruncator;
  onVisitDir?: (dir: string) => void;
}): {
  processFilePathForInjection: (
    filePath: string,
    sessionID: string,
    output: { title: string; output: string; metadata: unknown },
  ) => Promise<void>;
  clearSessionCache: (sessionID: string) => void;
} {
  const { workspaceDirectory, truncator, onVisitDir } = deps;
  const agentsCaches = new Map<string, Set<string>>();
  const rulesCaches = new Map<string, RulesCache>();

  function getAgentsCache(sessionID: string): Set<string> {
    let cache = agentsCaches.get(sessionID);
    if (!cache) {
      cache = loadInjectedPaths(sessionID);
      agentsCaches.set(sessionID, cache);
    }
    return cache;
  }

  function getRulesCache(sessionID: string): RulesCache {
    let cache = rulesCaches.get(sessionID);
    if (!cache) {
      cache = loadInjectedRules(sessionID);
      rulesCaches.set(sessionID, cache);
    }
    return cache;
  }

  function clearSessionCache(sessionID: string): void {
    agentsCaches.delete(sessionID);
    rulesCaches.delete(sessionID);
  }

  async function processFilePathForInjection(
    filePath: string,
    sessionID: string,
    output: { title: string; output: string; metadata: unknown },
  ): Promise<void> {
    if (output.output.includes(`[${DIRECTORY_CONTEXT_HEADER}]`)) return;
    const resolved = resolveUnifiedFilePath(workspaceDirectory, filePath);
    if (!resolved) return;
    const projectRoot = findProjectRoot(resolved);
    const agentsCache = getAgentsCache(sessionID);
    const rulesCache = getRulesCache(sessionID);
    const dirs = collectAncestorDirs(resolved, workspaceDirectory, projectRoot, onVisitDir);
    const sections: string[] = [];
    const seenRulePaths = new Set<string>();
    let agentsDirty = false;
    let rulesDirty = false;

    for (const dir of dirs) {
      if (dir !== workspaceDirectory && (dir === workspaceDirectory || dir.startsWith(`${workspaceDirectory}/`))) {
        if (!agentsCache.has(dir)) {
          const section = await readAgentsSection(join(dir, AGENTS_FILENAME), sessionID, truncator);
          if (section) {
            sections.push(section);
            agentsCache.add(dir);
            agentsDirty = true;
          }
        }
      }
      const inScope = !projectRoot || dir === projectRoot || dir.startsWith(`${projectRoot}/`) || projectRoot.startsWith(`${dir}/`);
      if (!inScope) continue;
      for (const [parent, subdir] of PROJECT_RULE_SUBDIRS) {
        const files: string[] = [];
        findRuleFilesRecursive(join(dir, parent, subdir), files);
        for (const candidate of files) {
          const realPath = safeRealpathSync(candidate);
          if (seenRulePaths.has(realPath)) continue;
          seenRulePaths.add(realPath);
          if (isDuplicateByRealPath(realPath, rulesCache.realPaths)) continue;
          const { metadata } = parseRuleFrontmatter(readFileSync(candidate, "utf-8"));
          const match = shouldApplyRule(metadata, resolved, projectRoot);
          if (!match.applies) continue;
          const rel = projectRoot ? relative(projectRoot, candidate) : candidate;
          const section = await readRuleSection(candidate, rel, match.reason ?? "matched", sessionID, truncator, rulesCache);
          if (section) {
            sections.push(section);
            rulesCache.realPaths.add(realPath);
            rulesDirty = true;
          }
        }
      }
      if (projectRoot && dir === projectRoot) {
        for (const single of PROJECT_RULE_FILES) {
          const candidate = join(projectRoot, single);
          const realPath = safeRealpathSync(candidate);
          if (seenRulePaths.has(realPath)) continue;
          seenRulePaths.add(realPath);
          if (isDuplicateByRealPath(realPath, rulesCache.realPaths)) continue;
          const section = await readRuleSection(candidate, single, "copilot-instructions (always apply)", sessionID, truncator, rulesCache);
          if (section) {
            sections.push(section);
            rulesCache.realPaths.add(realPath);
            rulesDirty = true;
          }
        }
      }
    }

    if (sections.length === 0) return;
    output.output += buildDirectoryContextBlock(sections);
    if (agentsDirty) saveInjectedPaths(sessionID, agentsCache);
    if (rulesDirty) saveInjectedRules(sessionID, rulesCache);
  }

  return { processFilePathForInjection, clearSessionCache };
}
