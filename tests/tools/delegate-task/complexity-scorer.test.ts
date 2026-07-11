import { describe, expect, test } from "bun:test"
import { autoScoreComplexity } from "../../../src/tools/delegate-task/complexity-scorer"

describe("autoScoreComplexity", () => {
	test("trivial keywords score level 1", () => {
		//#given
		const input = { description: "fix typo in comment" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(1)
	})

	test("simple keywords score level 2", () => {
		//#given
		const input = { description: "add utility function" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(2)
	})

	test("no keywords with source category uses baseline level 4", () => {
		//#given
		const input = { description: "do something", category: "source" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(4)
	})

	test("no keywords with bullet-time category uses baseline level 1", () => {
		//#given
		const input = { description: "do something", category: "bullet-time" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(1)
	})

	test("architectural keywords score level 5", () => {
		//#given
		const input = { description: "system-wide migration plan" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(5)
	})

	test("6+ skills bumps minimum score to 4", () => {
		//#given
		const input = {
			description: "do something",
			loadSkills: ["a", "b", "c", "d", "e", "f"],
		}

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(4)
	})

	test("trivial and architectural combined: trivial wins when no complex keywords", () => {
		//#given — code checks hasTrivial && !hasComplex first, so trivial (1) wins over architectural (5)
		const input = { description: "fix typo but also system-wide" }

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(1)
	})

	test("empty input defaults to level 3", () => {
		//#given
		const input = {}

		//#when
		const score = autoScoreComplexity(input)

		//#then
		expect(score).toBe(3)
	})
})
