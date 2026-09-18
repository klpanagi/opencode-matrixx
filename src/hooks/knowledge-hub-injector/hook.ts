import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { Message, Part } from "@opencode-ai/sdk";
import type { KnowledgeHub } from "../../config/schema/knowledge";
import { type ContextCollector, contextCollector } from "../../features/context-injector";
import { expandHubPath } from "../../features/knowledge-hub/loader";
import { getMainSessionID } from "../../features/session-state";
import { createDynamicTruncator } from "../../shared/dynamic-truncator";
import { log } from "../../shared/logger";

// Conservative cap for a hub index file (~22KB expected).
const INDEX_MAX_TOKENS = 6000;

// One-line routing directive, prepended to the payload (plain text, no secrets).
const ROUTER_DIRECTIVE =
  "Consult these hubs before websearch/webfetch; open files via @hub/path on demand, never bulk-read.";

export interface KnowledgeHubInjectorOptions {
  hubs?: KnowledgeHub[];
  getHubs?: () => KnowledgeHub[];
  pinnedFiles?: string[];
  collector?: ContextCollector;
}

interface MessageWithParts {
  info: Message;
  parts: Part[];
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
  const collector = options.collector ?? contextCollector;
  const resolveHubs = (): KnowledgeHub[] => options.getHubs?.() ?? options.hubs ?? [];

  const truncator = createDynamicTruncator(ctx);
  const sessionCaches = new Map<string, Set<string>>();

  const appendOnce = (
    injected: Set<string>,
    key: string,
    filePath: string,
    blocks: string[],
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
    blocks.push(`<${openTag}>\n${truncated.result}\n</${closeTag}>`);
  };

  const collectBlocks = (injected: Set<string>, blocks: string[]): void => {
    let hubs: KnowledgeHub[];
    try {
      hubs = resolveHubs();
    } catch {
      log("[knowledge-hub-injector] hub resolve failed, skipping");
      return;
    }
    for (const hub of hubs) {
      const { root, indexPath } = resolveHubPaths(hub, workspaceDir);
      appendOnce(injected, `${hub.name}:${indexPath}`, indexPath, blocks, `knowledge-hub name="${hub.name}"`, "knowledge-hub");
      if (hub.mode === "pinned") {
        for (const pinned of pinnedFiles) {
          const pinnedPath = path.isAbsolute(pinned) ? pinned : path.join(root, pinned);
          appendOnce(injected, `pinned:${pinnedPath}`, pinnedPath, blocks, `knowledge-hub-pin name="${hub.name}" file="${pinnedPath}"`, "knowledge-hub-pin");
        }
      }
    }
  };

  const transform = async (_input: Record<string, never>, output: { messages: MessageWithParts[] }): Promise<void> => {
    const { messages } = output;
    if (!messages || messages.length === 0) return;

    let lastUserMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].info.role === "user") {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];
    const messageSessionID = (lastUserMessage.info as unknown as { sessionID?: string }).sessionID;
    const sessionID = messageSessionID ?? getMainSessionID();
    if (!sessionID) return;

    let injected = sessionCaches.get(sessionID);
    if (!injected) {
      injected = new Set<string>();
      sessionCaches.set(sessionID, injected);
    }

    const blocks: string[] = [];
    collectBlocks(injected, blocks);
    if (blocks.length === 0) return;

    collector.register(sessionID, {
      id: "knowledge-hub-router",
      source: "custom",
      content: `${ROUTER_DIRECTIVE}\n\n${blocks.join("\n\n")}`,
      priority: "high",
    });
    log("[knowledge-hub-injector] router registered", { sessionID, blocks: blocks.length });
  };

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = event.properties as Record<string, unknown> | undefined;

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string } | undefined;
      if (sessionInfo?.id) {
        sessionCaches.delete(sessionInfo.id);
        collector.clear(sessionInfo.id);
      }
    }

    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ??
        (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        sessionCaches.delete(sessionID);
        collector.clear(sessionID);
      }
    }
  };

  return {
    "experimental.chat.messages.transform": transform,
    event: eventHandler,
  };
}
