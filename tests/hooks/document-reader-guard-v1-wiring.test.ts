/// <reference types="bun-types" />
/**
 * Wave 6.1 — closes the pre-existing V1 gap where `documentReaderGuard` was
 * created and returned by `createToolGuardHooks` but never invoked on the V1
 * `tool.execute.before` path (it was only wired into the V2 guard chain).
 * Wiring it ADDS a deny that did not previously exist on V1.
 */
import { describe, expect, test } from "bun:test"
import { createDocumentReaderGuardHook } from "../../src/hooks/document-reader-guard"
import { V1_HOOK_KEYS } from "../../src/config/schema/hooks-v1-keys"
import { createToolExecuteBeforeHandler } from "../../src/plugin/tool-execute-before"
import type { CreatedHooks } from "../../src/create-hooks"
import type { PluginContext } from "../../src/plugin/types"

type MinimalHooks = Pick<CreatedHooks, "documentReaderGuard">

function buildHooks(hook: CreatedHooks["documentReaderGuard"]): MinimalHooks {
  return { documentReaderGuard: hook }
}

function buildCtx(): PluginContext {
  return { directory: "/tmp/matrixx-doc-guard-test" } as unknown as PluginContext
}

describe("V1 tool.execute.before — documentReaderGuard wiring", () => {
  test("V1 before-handler throws on a generic Read of a binary document", async () => {
    //#given
    const guard = createDocumentReaderGuardHook(buildCtx())
    const handler = createToolExecuteBeforeHandler({
      ctx: buildCtx(),
      hooks: buildHooks(guard) as CreatedHooks,
    })
    const input = { tool: "read", sessionID: "ses_1", callID: "call_1" }
    const output = { args: { filePath: "/tmp/report.pdf" } }

    //#when / #then
    await expect(handler(input, output)).rejects.toThrow(/document_reader/i)
  })

  test("V1 before-handler throws on a bash document read", async () => {
    //#given
    const guard = createDocumentReaderGuardHook(buildCtx())
    const handler = createToolExecuteBeforeHandler({
      ctx: buildCtx(),
      hooks: buildHooks(guard) as CreatedHooks,
    })
    const input = { tool: "bash", sessionID: "ses_1", callID: "call_2" }
    const output = { args: { command: "cat /tmp/report.docx" } }

    //#when / #then
    await expect(handler(input, output)).rejects.toThrow()
  })

  test("V1 before-handler allows a Read of a text file", async () => {
    //#given
    const guard = createDocumentReaderGuardHook(buildCtx())
    const handler = createToolExecuteBeforeHandler({
      ctx: buildCtx(),
      hooks: buildHooks(guard) as CreatedHooks,
    })
    const input = { tool: "read", sessionID: "ses_1", callID: "call_3" }
    const output = { args: { filePath: "/tmp/notes.md" } }

    //#when
    await handler(input, output)

    //#then
    expect(output.args.filePath).toBe("/tmp/notes.md")
  })

  test("the guard is invoked under the V1 tool.execute.before key", () => {
    //#given
    const guard = createDocumentReaderGuardHook(buildCtx())

    //#when / #then
    expect(typeof guard[V1_HOOK_KEYS.toolExecuteBefore]).toBe("function")
  })
})
