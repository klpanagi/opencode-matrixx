/// <reference types="bun-types" />
import { describe, expect, mock, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import { injectContinuation } from "../../../src/hooks/task-continuation-enforcer/continuation-injection"
import { createSessionStateStore } from "../../../src/hooks/task-continuation-enforcer/session-state"

// Regression coverage for the false "[SYSTEM DIRECTIVE: MATRIXX - TASK CONTINUATION]"
// injection. Historically the enforcer treated ANY lingering background task as an
// implementation workstream and injected an imperative "invoke the plan agent, execute
// its waves exactly" bootstrap prompt. Because every `task(category=…)` delegation and
// every assembly voter is labelled `agent:"mouse"`, the explorer allow-list never
// matched — so ANY research/analysis session that delegated tripped the bootstrap path
// even after the agent had finished. Continuation must fire ONLY for real incomplete
// Matrixx tasks.

type InjectArgs = Parameters<typeof injectContinuation>[0]
type BgManager = NonNullable<InjectArgs["backgroundManager"]>

function writeValidTask(dir: string, id: string, status = "pending", threadID?: string): void {
	const task: Record<string, unknown> = { id, subject: `task ${id}`, description: "d", status, blocks: [], blockedBy: [] }
	if (threadID) task.threadID = threadID
	mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
	writeFileSync(join(dir, ".matrixx", "tasks", `${id}.json`), JSON.stringify(task))
}

function makeBackgroundManager(entries: Array<{ agent: string; status: string }>): BgManager {
	return {
		getTasksByParentSession: () => entries,
	} as unknown as BgManager
}

function makeInjectionCtx(dir: string): { ctx: PluginInput; promptAsync: ReturnType<typeof mock> } {
	const promptAsync = mock(async () => ({} as never))
	const ctx = {
		directory: dir,
		client: {
			tui: { showToast: mock(async () => ({} as never)) },
			session: {
				messages: async () => ({ data: [] } as unknown as never) as never,
				promptAsync,
			},
		},
	} as unknown as PluginInput
	return { ctx, promptAsync }
}

const resolvedInfo = {
	agent: "morpheus",
	model: { providerID: "p", modelID: "m" },
	tools: { edit: true },
}

describe("task-continuation-enforcer regression: no false bootstrap directive", () => {
	test("does not inject when no task dir exists, even with a lingering completed category (mouse) background task", async () => {
		//#given a research-style session that delegated via task(category=…) — labelled agent:"mouse", already completed
		const dir = mkdtempSync(join(tmpdir(), "task-cont-regress-"))
		const { ctx, promptAsync } = makeInjectionCtx(dir)
		const store = createSessionStateStore()
		const backgroundManager = makeBackgroundManager([{ agent: "mouse", status: "completed" }])

		//#when session goes idle with no Matrixx tasks at all
		await injectContinuation({ ctx, sessionID: "s-regress-nodir", backgroundManager, sessionStateStore: store, resolvedInfo })

		//#then no continuation directive is injected
		expect(promptAsync).not.toHaveBeenCalled()
		store.shutdown()
		rmSync(dir, { recursive: true, force: true })
	})

	test("does not inject when the tasks dir exists but holds no tasks", async () => {
		//#given an empty task dir plus a completed category (mouse) background task
		const dir = mkdtempSync(join(tmpdir(), "task-cont-regress-"))
		mkdirSync(join(dir, ".matrixx", "tasks"), { recursive: true })
		const { ctx, promptAsync } = makeInjectionCtx(dir)
		const store = createSessionStateStore()
		const backgroundManager = makeBackgroundManager([{ agent: "mouse", status: "completed" }])

		//#when session goes idle with zero tasks
		await injectContinuation({ ctx, sessionID: "s-regress-empty", backgroundManager, sessionStateStore: store, resolvedInfo })

		//#then no continuation directive is injected
		expect(promptAsync).not.toHaveBeenCalled()
		store.shutdown()
		rmSync(dir, { recursive: true, force: true })
	})

	test("still injects the task continuation prompt (not the removed bootstrap prompt) for a fresh real task", async () => {
		//#given a fresh, real Matrixx task
		const dir = mkdtempSync(join(tmpdir(), "task-cont-regress-"))
		writeValidTask(dir, "T-fresh", "pending", "s-regress-fresh")
		const { ctx, promptAsync } = makeInjectionCtx(dir)
		const store = createSessionStateStore()

		//#when session goes idle
		await injectContinuation({ ctx, sessionID: "s-regress-fresh", sessionStateStore: store, resolvedInfo })

		//#then the ordinary continuation prompt is injected and the bootstrap text is gone
		expect(promptAsync).toHaveBeenCalledTimes(1)
		const payload = JSON.stringify(promptAsync.mock.calls[0])
		expect(payload).toContain("TASK CONTINUATION")
		expect(payload).not.toContain("Invoke the plan agent NOW")
		expect(payload).not.toContain("execute its waves exactly")
		store.shutdown()
		rmSync(dir, { recursive: true, force: true })
	})
})
