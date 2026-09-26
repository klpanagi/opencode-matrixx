import type { PluginContext } from "../../plugin/types";
import { createPostReadInjectorHook } from "../post-read-injector/hook";

export function createRulesInjectorHook(ctx: PluginContext) {
  return createPostReadInjectorHook(ctx, { trackedTools: ["read", "write", "edit", "multiedit"] });
}
