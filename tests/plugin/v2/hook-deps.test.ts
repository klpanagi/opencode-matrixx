/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import { V1_HOOK_KEYS } from "../../../src/config/schema/hooks-v1-keys"
import type { CreatedHooks } from "../../../src/create-hooks"
import { toV2HookDeps } from "../../../src/plugin/v2/hook-deps"
import type { PluginInterface } from "../../../src/plugin/types"

function stubHooks(overrides: Record<string, unknown> = {}): CreatedHooks {
  return overrides as unknown as CreatedHooks
}

function stubInterface(overrides: Record<string, unknown> = {}): PluginInterface {
  return overrides as unknown as PluginInterface
}

describe("toV2HookDeps", () => {
  test("forwards the live plugin-interface handlers, not fresh stubs", () => {
    //#given a plugin interface whose handlers are identifiable function objects
    const before = async (): Promise<void> => undefined
    const after = async (): Promise<void> => undefined
    const chatMessage = async (): Promise<void> => undefined
    const messagesTransform = async (): Promise<void> => undefined
    const event = async (): Promise<void> => undefined
    const pluginInterface = stubInterface({
      [V1_HOOK_KEYS.toolExecuteBefore]: before,
      [V1_HOOK_KEYS.toolExecuteAfter]: after,
      [V1_HOOK_KEYS.chatMessage]: chatMessage,
      [V1_HOOK_KEYS.messagesTransform]: messagesTransform,
      event,
    })

    //#when the deps are derived
    const deps = toV2HookDeps({ pluginInterface, hooks: stubHooks() })

    //#then each V2 dep is the very handler the V1 interface exposes
    expect(deps.toolExecuteBefore).toBe(before)
    expect(deps.toolExecuteAfter).toBe(after)
    expect(deps.chatMessage).toBe(chatMessage)
    expect(deps.messagesTransform).toBe(messagesTransform)
    expect(deps.event).toBe(event)
  })

  test("always supplies a compaction handler built from the hook tiers", () => {
    //#given hooks carrying the compaction tier
    const hooks = stubHooks({
      compactionContextInjector: () => "injected",
    })

    //#when
    const deps = toV2HookDeps({ pluginInterface: stubInterface(), hooks })

    //#then the compacting dep is present and callable
    expect(typeof deps.sessionCompacting).toBe("function")
  })
})
