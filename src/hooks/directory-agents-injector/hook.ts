import type { PluginInput } from "@opencode-ai/plugin";
import { createPostReadInjectorHook } from "../post-read-injector/hook";

export function createDirectoryAgentsInjectorHook(ctx: PluginInput) {
  return createPostReadInjectorHook(ctx, { trackedTools: ["read"] });
}
