import type { PermissionEvaluation } from "@opencode/plugin/promise/permission"
import type {
  SessionCompaction,
  SessionContext,
  SessionPrompt,
} from "@opencode/plugin/promise/session"

import type { V2PluginContext } from "../types"

type ToolHookFn = V2PluginContext["tool"]["hook"]
type EventSubscribeFn = V2PluginContext["event"]["subscribe"]

export type V2ToolHookName = "execute.before" | "execute.after"
export type V2SessionHookName = "prompt" | "context" | "compaction"
export type V2PermissionHookName = "evaluate"

type AllToolHookInputs = Parameters<Parameters<ToolHookFn>[1]>[0]

type SettledToolHookInput = Extract<AllToolHookInputs, { status: "completed" | "error" }>

export type V2ToolBeforeInput = Exclude<AllToolHookInputs, SettledToolHookInput>
export type V2ToolAfterInput = SettledToolHookInput
export type V2ToolCompletedResult = Extract<V2ToolAfterInput, { status: "completed" }>["result"]
export type V2ToolHookInput = AllToolHookInputs

export type V2PromptInput = SessionPrompt
export type V2ContextInput = SessionContext
export type V2CompactionInput = SessionCompaction
export type V2SessionHookInput = SessionPrompt | SessionContext | SessionCompaction
export type V2PermissionEvaluation = PermissionEvaluation

export type V2HookRegistration = Awaited<ReturnType<ToolHookFn>>

export type V2EventItem = ReturnType<EventSubscribeFn> extends AsyncIterable<infer Item>
  ? Item
  : never

export type V2EventSubscribe = EventSubscribeFn

/**
 * The subset of the V2 plugin context this module registers hooks through.
 * A real `Context` satisfies it structurally, and so does a test fake that only
 * implements `tool.hook`, `session.hook`, `permission.hook` and
 * `event.subscribe`.
 */
export type V2HookRegistrar = {
  tool: {
    hook: (
      name: V2ToolHookName,
      callback: (input: V2ToolHookInput) => Promise<void> | void
    ) => Promise<V2HookRegistration>
  }
  session: {
    hook: (
      name: V2SessionHookName,
      callback: (input: V2SessionHookInput) => Promise<void> | void
    ) => Promise<V2HookRegistration>
  }
  permission: {
    hook: (
      name: V2PermissionHookName,
      callback: (input: V2PermissionEvaluation) => Promise<void> | void
    ) => Promise<V2HookRegistration>
  }
  event: {
    subscribe: V2EventSubscribe
  }
}
