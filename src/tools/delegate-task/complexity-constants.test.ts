import { describe, expect, test } from "bun:test"
import { resolveComplexityModel } from "./complexity-constants"

describe("resolveComplexityModel", () => {
	test("level 1 on source category downgrades to haiku", () => {
		//#given
		const result = resolveComplexityModel("source", 1, "anthropic/claude-opus-4-6")

		//#when — built-in map has { 1: "anthropic/claude-haiku-4-5" }

		//#then
		expect(result.model).toBe("anthropic/claude-haiku-4-5")
		expect(result.downgraded).toBe(true)
	})

	test("level 2 on source category downgrades to sonnet", () => {
		//#given
		const result = resolveComplexityModel("source", 2, "anthropic/claude-opus-4-6")

		//#when — built-in map has { 2: "anthropic/claude-sonnet-4-6" }

		//#then
		expect(result.model).toBe("anthropic/claude-sonnet-4-6")
		expect(result.downgraded).toBe(true)
	})

	test("level 3 on source category returns original model", () => {
		//#given
		const result = resolveComplexityModel("source", 3, "anthropic/claude-opus-4-6")

		//#when — level 3 is not downgradable

		//#then
		expect(result.model).toBe("anthropic/claude-opus-4-6")
		expect(result.downgraded).toBe(false)
	})

	test("bullet-time with level 1 returns original model when no downgrade map entry", () => {
		//#given — bullet-time has no built-in downgrades (already cheapest)
		const result = resolveComplexityModel("bullet-time", 1, "claude-haiku-4-5")

		//#when — BUILTIN_COMPLEXITY_DOWNGRADES["bullet-time"] is undefined

		//#then
		expect(result.model).toBe("claude-haiku-4-5")
		expect(result.downgraded).toBe(false)
	})

	test("user override downgrade wins over built-in", () => {
		//#given
		const userDowngrades = { "1": "claude-haiku-4-5" }

		//#when — user-provided downgrade map takes precedence over BUILTIN_COMPLEXITY_DOWNGRADES
		const result = resolveComplexityModel("source", 1, "anthropic/claude-sonnet-4-6", userDowngrades)

		//#then
		expect(result.model).toBe("claude-haiku-4-5")
		expect(result.downgraded).toBe(true)
	})
})
