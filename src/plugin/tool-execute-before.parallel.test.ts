/**
 * Task T1.1: 100-parallel-call race test for `tool.execute.before`.
 *
 * Validates that the 3-wave parallelization (Promise.all + Promise.allSettled
 * + sequential mutator chain) is safe under concurrent invocation:
 *
 *   1. Cross-call state isolation: 100 concurrent handler invocations with
 *      unique inputs (callID, sessionID, tool) each produce a correct
 *      output. No call's output is contaminated by another call's input.
 *
 *   2. Per-invocation hook coverage: every fast-fail hook is called for
 *      every invocation. This proves the refactor did not accidentally
 *      short-circuit any wave (e.g., an early return that skips Wave 3).
 *
 *   3. prometheusMdOnly dual-invocation: since this hook runs in BOTH
 *      Wave 2 (BLOCKING) and Wave 3 (MUTATOR), it must be called exactly
 *      TWICE per invocation (200 total across 100 invocations).
 *
 * Uses spyOn (not `mock.module()`) to keep the test isolated from
 * CI's mock-heavy test list (see AGENTS.md "Tests that MUST be isolated").
 */
import { describe, expect, spyOn, test } from "bun:test"
import { createToolExecuteBeforeHandler } from "./tool-execute-before"

type CreatedHooks = Parameters<typeof createToolExecuteBeforeHandler>[0]["hooks"]
type PluginContext = Parameters<typeof createToolExecuteBeforeHandler>[0]["ctx"]

const FAST_FAIL_HOOK_NAMES = [
  // Wave 1: READ_ONLY
  "qualityGate",
  "commentChecker",
  "directoryAgentsInjector",
  "directoryReadmeInjector",
  "rulesInjector",
  // Wave 2: BLOCKING
  "secretLeakGuard",
  "envFileWriteGuard",
  "writeExistingFileGuard",
  "tasksTodowriteDisabler",
  "prometheusMdOnly",
  // Wave 3: MUTATOR
  "nonInteractiveEnv",
  "bashFileReadGuard",
  "questionLabelTruncator",
  "sisyphusJuniorNotepad",
  "atlasHook",
] as const

type FastFailHookName = (typeof FAST_FAIL_HOOK_NAMES)[number]

const TOOLS = ["bash", "read", "edit", "write", "webfetch"] as const

function buildStubHooks(spies: Record<FastFailHookName, ReturnType<typeof spyOn>>) {
  // Build a minimal but type-compatible CreatedHooks object. Hooks not in
  // FAST_FAIL_HOOK_NAMES are stubbed as no-ops (not under test for race
  // correctness here). Each fast-fail hook is replaced with a spy that
  // also stamps the callID onto output.args so we can detect cross-call
  // contamination.
  const hooks: Record<string, unknown> = {}

  // All fast-fail hooks are present, keyed by their CreatedHooks property name.
  for (const name of FAST_FAIL_HOOK_NAMES) {
    // Stub the underlying hook: just record the (input, output) it was called
    // with so we can verify ordering/per-invocation coverage. We use spyOn
    // on a plain object method (no real implementation needed).
    const obj = {
      "tool.execute.before": async (input: { callID: string }, output: { args: Record<string, unknown> }) => {
        // Stamp the callID into output.args so we can detect cross-call
        // contamination: if any call sees another call's callID, the
        // output was clobbered by concurrent mutation.
        output.args.callID = input.callID
      },
    }
    hooks[name] = obj
    spies[name] = spyOn(obj, "tool.execute.before")
  }

  // Stub remaining CreatedHooks fields to no-op. The handler uses optional
  // chaining (`?.["tool.execute.before"]?.`) so undefined entries are fine,
  // but we need a structurally compatible object for the type system.
  const NOOP_HOOKS = {
    "tool.execute.before": async () => {},
  }
  for (const name of [
    "categorySkillReminder",
    "autoSlashCommand",
    "stopContinuationGuard",
    "compactionContextInjector",
    "compactionTodoPreserver",
    "todoContinuationEnforcer",
    "unstableAgentBabysitter",
    "backgroundNotificationHook",
    "keywordDetector",
    "contextInjectorMessagesTransform",
    "thinkingBlockValidator",
    "toolPairValidator",
    "designIntentPreserver",
    "toolOutputTruncator",
    "emptyTaskResponseDetector",
    "hashlineReadEnhancer",
    "jsonErrorRecovery",
    "todoDescriptionOverride",
    "readImageResizer",
    "webfetchRedirectGuard",
    "hashlineEditDiffEnhancer",
    "taskNotepad",
    "contextWindowMonitor",
    "preemptiveCompaction",
    "sessionRecovery",
    "sessionNotification",
    "thinkMode",
    "anthropicContextWindowLimitRecovery",
    "autoUpdateChecker",
    "agentUsageReminder",
    "interactiveBashSession",
    "matrixLoop",
    "editErrorRecovery",
    "delegateTaskRetry",
    "startWork",
    "taskResumeInfo",
    "anthropicEffort",
    "runtimeFallback",
  ] as const) {
    if (hooks[name] === undefined) {
      hooks[name] = NOOP_HOOKS
    }
  }

  return hooks as unknown as CreatedHooks
}

describe("tool.execute.before — T1.1 parallel safety", () => {
  test(
    "100 parallel invocations produce correct output",
    async () => {
      //#given
      const spies = {} as Record<FastFailHookName, ReturnType<typeof spyOn>>
      const hooks = buildStubHooks(spies)
      const ctx: PluginContext = { client: {} } as PluginContext
      const handler = createToolExecuteBeforeHandler({ ctx, hooks })

      const N = 100
      const calls = Array.from({ length: N }, (_, i) => ({
        input: {
          tool: TOOLS[i % TOOLS.length] as string,
          sessionID: `ses_${i}`,
          callID: `call_${i}`,
        },
        output: { args: {} as Record<string, unknown> },
      }))

      //#when
      await Promise.all(calls.map(({ input, output }) => handler(input, output)))

      //#then — 1: cross-call isolation
      // Every output's stamped callID must match the input's callID.
      // If any output carries a different callID, the parallel mutation
      // raced (e.g., Wave 3's sequential chain was actually parallel,
      // or hooks share state outside their callID scope).
      for (let i = 0; i < N; i++) {
        const expected = `call_${i}`
        const actual = calls[i]?.output.args.callID
        expect(actual).toBe(expected)
      }

      //#then — 2: per-invocation hook coverage (single-call hooks called 100x)
      const SINGLE_CALL_HOOKS: FastFailHookName[] = [
        "qualityGate",
        "commentChecker",
        "directoryAgentsInjector",
        "directoryReadmeInjector",
        "rulesInjector",
        "secretLeakGuard",
        "envFileWriteGuard",
        "writeExistingFileGuard",
        "tasksTodowriteDisabler",
        "nonInteractiveEnv",
        "bashFileReadGuard",
        "questionLabelTruncator",
        "sisyphusJuniorNotepad",
        "atlasHook",
      ]
      for (const name of SINGLE_CALL_HOOKS) {
        expect(spies[name]).toBeDefined()
        expect(spies[name]?.mock.calls.length).toBe(N)
      }

      //#then — 3: prometheusMdOnly dual-invocation (Wave 2 + Wave 3)
      // It must be called exactly 2N times across all invocations.
      expect(spies.prometheusMdOnly).toBeDefined()
      expect(spies.prometheusMdOnly?.mock.calls.length).toBe(N * 2)
    },
    10_000,
  )
})
