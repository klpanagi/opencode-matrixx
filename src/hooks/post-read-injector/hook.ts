import type { PluginInput } from "@opencode-ai/plugin";
import { createDynamicTruncator } from "../../shared/dynamic-truncator";
import { clearInjectedPaths } from "../directory-agents-injector/storage";
import { getRuleInjectionFilePath } from "../rules-injector/output-path";
import { clearInjectedRules } from "../rules-injector/storage";
import { createUnifiedPostReadProcessor } from "./injector";

const DEFAULT_TRACKED_TOOLS = ["read", "write", "edit", "multiedit"];

export function createPostReadInjectorHook(ctx: PluginInput, options?: { trackedTools?: string[] }) {
  const truncator = createDynamicTruncator(ctx);
  const { processFilePathForInjection, clearSessionCache } = createUnifiedPostReadProcessor({
    workspaceDirectory: ctx.directory,
    truncator,
  });
  const tracked = (options?.trackedTools ?? DEFAULT_TRACKED_TOOLS).map((tool) => tool.toLowerCase());

  const toolExecuteAfter = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { title: string; output: string; metadata: unknown },
  ) => {
    if (!tracked.includes(input.tool.toLowerCase())) return;
    const filePath = getRuleInjectionFilePath({ title: output.title, metadata: output.metadata });
    if (!filePath) return;
    await processFilePathForInjection(filePath, input.sessionID, output);
  };

  const toolExecuteBefore = async (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ): Promise<void> => {
    void input;
    void output;
  };

  const eventHandler = async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined;
    if (event.type === "session.deleted") {
      const info = props?.info as { id?: string } | undefined;
      if (info?.id) {
        clearSessionCache(info.id);
        clearInjectedPaths(info.id);
        clearInjectedRules(info.id);
      }
    }
    if (event.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined;
      if (sessionID) {
        clearSessionCache(sessionID);
        clearInjectedPaths(sessionID);
        clearInjectedRules(sessionID);
      }
    }
  };

  return {
    "tool.execute.before": toolExecuteBefore,
    "tool.execute.after": toolExecuteAfter,
    event: eventHandler,
  };
}
