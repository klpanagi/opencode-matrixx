import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { KnowledgeHub } from "../../config/schema/knowledge";
import { expandHubPath } from "../../features/knowledge-hub/loader";
import { createDynamicTruncator } from "../../shared/dynamic-truncator";
import { log } from "../../shared/logger";
import { createDirectoryInjectorHook } from "../directory-injector/factory";

// Conservative cap for a hub index file (~22KB expected).
const INDEX_MAX_TOKENS = 6000;

export interface KnowledgeHubInjectorOptions {
  hubs?: KnowledgeHub[];
  getHubs?: () => KnowledgeHub[];
  pinnedFiles?: string[];
}

function resolveHubPaths(hub: KnowledgeHub, workspaceDir: string): { root: string; indexPath: string } {
  const root = expandHubPath(hub.path, workspaceDir);
  return { root, indexPath: path.join(root, hub.index ?? "_index.md") };
}

function readQuiet(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function createKnowledgeHubInjectorHook(ctx: PluginInput, options: KnowledgeHubInjectorOptions = {}) {
  const workspaceDir = ctx.directory;
  const pinnedFiles = options.pinnedFiles ?? [];
  const resolveHubs = (): KnowledgeHub[] => options.getHubs?.() ?? options.hubs ?? [];

  const truncator = createDynamicTruncator(ctx);

  const appendOnce = (
    injected: Set<string>,
    key: string,
    filePath: string,
    // biome-ignore lint/suspicious/noExplicitAny: factory output shape is untyped
    output: { title: string; output: string; metadata: any },
    openTag: string,
    closeTag: string,
  ): void => {
    if (injected.has(key)) return;
    injected.add(key);
    const content = readQuiet(filePath);
    if (content === null) {
      log("[knowledge-hub-injector] missing file, skipping", { filePath });
      return;
    }
    const truncated = truncator.truncateSync(content, INDEX_MAX_TOKENS);
    output.output += `\n\n<${openTag}>\n${truncated.result}\n</${closeTag}>`;
  };

  const processFile = async ({
    sessionCaches,
    sessionID,
    output,
  }: {
    sessionCaches: Map<string, Set<string>>;
    sessionID: string;
    // biome-ignore lint/suspicious/noExplicitAny: factory output shape is untyped
    output: { title: string; output: string; metadata: any };
  }): Promise<void> => {
    let injected = sessionCaches.get(sessionID);
    if (!injected) {
      injected = new Set<string>();
      sessionCaches.set(sessionID, injected);
    }
    for (const hub of resolveHubs()) {
      const { root, indexPath } = resolveHubPaths(hub, workspaceDir);
      appendOnce(injected, `${hub.name}:${indexPath}`, indexPath, output, `knowledge-hub name="${hub.name}"`, "knowledge-hub");
      if (hub.mode === "pinned") {
        for (const pinned of pinnedFiles) {
          const pinnedPath = path.isAbsolute(pinned) ? pinned : path.join(root, pinned);
          appendOnce(injected, `pinned:${pinnedPath}`, pinnedPath, output, `knowledge-hub-pin name="${hub.name}" file="${pinnedPath}"`, "knowledge-hub-pin");
        }
      }
    }
  };

  const clearInjectedPaths = (_sessionID: string): void => {
    void _sessionID;
  };

  return createDirectoryInjectorHook(ctx, processFile, clearInjectedPaths);
}
