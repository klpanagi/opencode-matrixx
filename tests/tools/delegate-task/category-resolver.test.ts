declare const require: (name: string) => unknown
const { describe, test, expect, beforeEach, afterEach, spyOn, mock } = require("bun:test")

import * as connectedProvidersCache from "../../../src/shared/connected-providers-cache"
import { _resetPresetStateForTesting, setSessionPreset } from "../../../src/features/preset-state/manager"
import { resolveCategoryExecution } from "../../../src/tools/delegate-task/category-resolver"
import type { ExecutorContext } from "../../../src/tools/delegate-task/executor-types"

describe("resolveCategoryExecution", () => {
	let connectedProvidersSpy: ReturnType<typeof spyOn> | undefined
	let providerModelsSpy: ReturnType<typeof spyOn> | undefined

	beforeEach(() => {
		mock.restore()
		_resetPresetStateForTesting()
		connectedProvidersSpy = spyOn(connectedProvidersCache, "readConnectedProvidersCache").mockReturnValue(null)
		providerModelsSpy = spyOn(connectedProvidersCache, "readProviderModelsCache").mockReturnValue(null)
	})

	afterEach(() => {
		_resetPresetStateForTesting()
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

	const sourceArgs = {
		category: "source",
		prompt: "test prompt",
		description: "Test task",
		run_in_background: false,
		load_skills: [],
		blockedBy: undefined,
		enableSkillTools: false,
	}

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

	test("complexity: 1 downgrades source model via synthetic config", async () => {
		//#given — synthetic downgrade via global complexityDowngrades
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
		const executorCtx = createMockExecutorContext({
			complexityDowngrades: { source: { "1": "provider-a/model-fast", "2": "provider-a/model-cheap" } },
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-a/model-fast")
		expect(result.complexityDowngraded).toBe(true)
		expect(result.complexityApplied).toBe(1)
	})

	test("complexity: 3 on source category keeps original model", async () => {
		//#given — level 3 is not downgradable
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
		const executorCtx = createMockExecutorContext({
			complexityDowngrades: { source: { "1": "provider-a/model-fast" } },
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-x/model-orig")
		expect(result.complexityDowngraded).toBe(false)
		expect(result.complexityApplied).toBe(3)
	})

	test("complexity: auto with trivial prompt downgrades via synthetic config", async () => {
		//#given — "fix typo" triggers trivial auto-score → level 1 → synthetic fast
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
		const executorCtx = createMockExecutorContext({
			complexityDowngrades: { source: { "1": "provider-a/model-fast" } },
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-a/model-fast")
		expect(result.complexityDowngraded).toBe(true)
	})

	test("complexity omitted on bullet-time does not downgrade without config", async () => {
		//#given — bullet-time has no downgrade entry, empty config → no downgrade
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
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.complexityDowngraded).toBe(false)
	})

	test("user complexity_downgrades override wins over global config", async () => {
		//#given — user provides custom downgrade for level 1, should win over global
		const executorCtx = createMockExecutorContext({
			userCategories: {
				"source": {
					complexity_downgrades: { "1": "provider-b/model-user" },
				},
			},
			complexityDowngrades: { source: { "1": "provider-a/model-global" } },
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
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(args, executorCtx, inheritedModel, systemDefaultModel)

		//#then — user override wins
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-b/model-user")
		expect(result.complexityDowngraded).toBe(true)
	})

	test("session overlay preset wins over config active_preset", async () => {
		//#given — session overlay assigns source → provider-a/model-overlay; config active_preset assigns source → provider-b/model-config
		setSessionPreset("ses-overlay", "overlay")
		const executorCtx = createMockExecutorContext({
			sessionID: "ses-overlay",
			modelPresets: {
				overlay: { agents: { source: { model: "provider-a/model-overlay" } } },
				config: { agents: { source: { model: "provider-b/model-config" } } },
			},
			activePreset: "config",
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(sourceArgs, executorCtx, inheritedModel, systemDefaultModel)

		//#then — session overlay wins over config active_preset
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-a/model-overlay")
	})

	test("unknown session overlay preset is ignored, falls back to config active_preset", async () => {
		//#given — overlay name not in model_presets; config active_preset is valid
		setSessionPreset("ses-unknown", "nope")
		const executorCtx = createMockExecutorContext({
			sessionID: "ses-unknown",
			modelPresets: {
				config: { agents: { source: { model: "provider-b/model-config" } } },
			},
			activePreset: "config",
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(sourceArgs, executorCtx, inheritedModel, systemDefaultModel)

		//#then — unknown overlay ignored, config active_preset applies
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-b/model-config")
	})

	test("config active_preset applies when no session overlay", async () => {
		//#given — no session overlay, config active_preset assigns source → provider-b/model-config
		const executorCtx = createMockExecutorContext({
			sessionID: "ses-plain",
			modelPresets: {
				config: { agents: { source: { model: "provider-b/model-config" } } },
			},
			activePreset: "config",
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(sourceArgs, executorCtx, inheritedModel, systemDefaultModel)

		//#then
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-b/model-config")
	})

	test("preset default_model fills category without explicit entry", async () => {
		//#given — preset has no source entry, only default_model
		const executorCtx = createMockExecutorContext({
			sessionID: "ses-default",
			modelPresets: {
				config: { default_model: "provider-c/model-default" },
			},
			activePreset: "config",
		})
		const inheritedModel = undefined
		const systemDefaultModel = "provider-x/model-orig"

		//#when
		const result = await resolveCategoryExecution(sourceArgs, executorCtx, inheritedModel, systemDefaultModel)

		//#then — default_model fills the gap
		expect(result.error).toBeUndefined()
		expect(result.actualModel).toBe("provider-c/model-default")
	})
})
})
