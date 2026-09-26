import type { PluginContext } from "../../plugin/types";
import { createPostReadInjectorHook } from "../post-read-injector/hook";

export function createDirectoryAgentsInjectorHook(ctx: PluginContext) {
  return createPostReadInjectorHook(ctx, { trackedTools: ["read"] });
}
