import type { PluginInput } from "@opencode-ai/plugin";
import { createPostReadInjectorHook } from "../post-read-injector/hook";

export function createRulesInjectorHook(ctx: PluginInput) {
  return createPostReadInjectorHook(ctx, { trackedTools: ["read", "write", "edit", "multiedit"] });
}
