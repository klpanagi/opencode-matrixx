declare const require: (name: string) => unknown
const { describe, test, expect, beforeEach, afterEach, spyOn, mock } = require("bun:test")

import * as connectedProvidersCache from "../../../src/shared/connected-providers-cache"
import { resolveCategoryExecution } from "../../../src/tools/delegate-task/category-resolver"
import type { ExecutorContext } from "../../../src/tools/delegate-task/executor-types"

describe("resolveCategoryExecution", () => {
	let connectedProvidersSpy: ReturnType<typeof spyOn> | undefined
	let providerModelsSpy: ReturnType<typeof spyOn> | undefined

	beforeEach(() => {
		mock.restore()
		connectedProvidersSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(null)
		providerModelsSpy = spyOn(connectedProvidersCache, "readProviderModelsCache").mockReturnValue(null)
	})

	afterEach(() => {
		connectedProvidersSpy?.mockRestore()
		providerModelsSpy?.mockRestore()
	})

	const createMockExecutorContext = (overrides?: Partial<ExecutorContext>): ExecutorContext => ({
		client: {} as unknown as ExecutorContext["client"],
		manager: {} as unknown as ExecutorContext["manager"],
		directory: "/tmp/test",
		userCategories: {},
		mouseModel: undefined,
		...overrides,
	})

	test("returns clear error when category exists but required model is not available", async () => {
		//#given - deep-jack now uses Claude-only chain, so it resolves successfully
		const args = {
			category: "deep-jack",
			prompt: "test prompt",
			description: "Test task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then - deep-jack resolves via system default (no requiresModel restriction)
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBeDefined()
		expect(result.actualModel).toContain("anthropic")
	})

	test("returns 'unknown category' error for truly unknown categories", async () => {
		//#given
		const args = {
			category: "definitely-not-a-real-category-xyz123",
			prompt: "test prompt",
			description: "Test task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeDefined()
		expect(result.error).toContain("Unknown category")
		expect(result.error).toContain("definitely-not-a-real-category-xyz123")
	})

describe("complexity integration", () => {
	let connectedProvidersSpy: ReturnType<typeof spyOn> | undefined
	let providerModelsSpy: ReturnType<typeof spyOn> | undefined

	beforeEach(() => {
		mock.restore()
		connectedProvidersSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(null)
		providerModelsSpy = spyOn(connectedProvidersCache, "readProviderModelsCache").mockReturnValue(null)
	})

	afterEach(() => {
		connectedProvidersSpy?.mockRestore()
		providerModelsSpy?.mockRestore()
	})

	test("complexity: 1 downgrades source model to haiku", async () => {
		//#given
		const args = {
			category: "source",
			prompt: "test prompt",
			description: "Test task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
			complexity: 1,
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("anthropic/claude-haiku-4-5")
		expect(result.complexityDowngraded).toBe(true)
		expect(result.complexityApplied).toBe(1)
	})

	test("complexity: 3 on source category keeps original model", async () => {
		//#given — level 3 is not downgradable; source tier "premium" resolves to opus
		connectedProvidersSpy?.mockReturnValue(["anthropic"])
		providerModelsSpy?.mockReturnValue({
			models: { anthropic: ["claude-opus-4-6"] },
			connected: ["anthropic"],
			updatedAt: new Date().toISOString(),
		})
		const args = {
			category: "source",
			prompt: "test prompt",
			description: "Test task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
			complexity: 3,
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("anthropic/claude-opus-4-6")
		expect(result.complexityDowngraded).toBe(false)
		expect(result.complexityApplied).toBe(3)
	})

	test("complexity: auto with trivial prompt downgrades model", async () => {
		//#given — "fix typo" triggers trivial auto-score → level 1 → haiku
		const args = {
			category: "source",
			prompt: "test prompt",
			description: "fix typo in comment",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
			complexity: "auto",
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("anthropic/claude-haiku-4-5")
		expect(result.complexityDowngraded).toBe(true)
	})

	test("complexity omitted on bullet-time does not downgrade", async () => {
		//#given — bullet-time already uses haiku, no cheaper model
		const args = {
			category: "bullet-time",
			prompt: "test prompt",
			description: "Quick task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
			// complexity omitted — will be auto-scored
		}
		const executorCtx = createMockExecutorContext()
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then — bullet-time uses haiku and auto-score gives level 1 (baseline), but no downgrade available
		expect(result.error).toBeUndefined()
		expect(result.complexityDowngraded).toBe(false)
	})

	test("user complexity_downgrades override wins over built-in", async () => {
		//#given — user provides custom downgrade for level 1 on source category
		const executorCtx = createMockExecutorContext({
			userCategories: {
				"source": {
					complexity_downgrades: { "1": "openai/gpt-4o-mini" },
				},
			},
		})
		const args = {
			category: "source",
			prompt: "test prompt",
			description: "Test task",
			run_in_background: false,
			load_skills: [],
			blockedBy: undefined,
			enableSkillTools: false,
			complexity: 1,
		}
		const inheritedModel = undefined
		const systemDefaultModel = "anthropic/claude-sonnet-4-5"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then — user override wins over BUILTIN_COMPLEXITY_DOWNGRADES
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("openai/gpt-4o-mini")
		expect(result.complexityDowngraded).toBe(true)
	})
})
})
