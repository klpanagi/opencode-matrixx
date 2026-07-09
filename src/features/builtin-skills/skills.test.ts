import { describe, expect, test } from "bun:test"
import { createBuiltinSkills } from "./skills"

describe("createBuiltinSkills", () => {
	test("returns playwright skill by default", () => {
		// given - no options (default)

		// when
		const skills = createBuiltinSkills()

		// then
		const browserSkill = skills.find((s) => s.name === "playwright")
		expect(browserSkill).toBeDefined()
		expect(browserSkill?.description).toContain("browser")
		expect(browserSkill?.mcpConfig).toHaveProperty("playwright")
	})

	test("returns playwright skill when browserProvider is 'playwright'", () => {
		// given
		const options = { browserProvider: "playwright" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		expect(playwrightSkill).toBeDefined()
		expect(agentBrowserSkill).toBeUndefined()
	})

	test("returns agent-browser skill when browserProvider is 'agent-browser'", () => {
		// given
		const options = { browserProvider: "agent-browser" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		expect(agentBrowserSkill).toBeDefined()
		expect(agentBrowserSkill?.description).toContain("browser")
		expect(agentBrowserSkill?.allowedTools).toContain("Bash(agent-browser:*)")
		expect(agentBrowserSkill?.template).toContain("agent-browser")
		expect(playwrightSkill).toBeUndefined()
	})

	test("agent-browser skill template is inlined (not loaded from file)", () => {
		// given
		const options = { browserProvider: "agent-browser" as const }

		// when
		const skills = createBuiltinSkills(options)
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")

		// then - template should contain substantial content (inlined, not fallback)
		expect(agentBrowserSkill?.template).toContain("## Quick start")
		expect(agentBrowserSkill?.template).toContain("## Commands")
		expect(agentBrowserSkill?.template).toContain("agent-browser open")
		expect(agentBrowserSkill?.template).toContain("agent-browser snapshot")
	})

	test("always includes frontend-ui-ux, git-master, and dsl skills", () => {
		// given - both provider options

		// when
		const defaultSkills = createBuiltinSkills()
		const agentBrowserSkills = createBuiltinSkills({ browserProvider: "agent-browser" })

		// then
		for (const skills of [defaultSkills, agentBrowserSkills]) {
			expect(skills.find((s) => s.name === "frontend-ui-ux")).toBeDefined()
			expect(skills.find((s) => s.name === "git-master")).toBeDefined()
			expect(skills.find((s) => s.name === "dsl-core")).toBeDefined()
			expect(skills.find((s) => s.name === "dsl-grammar")).toBeDefined()
			expect(skills.find((s) => s.name === "dsl-codegen")).toBeDefined()
			expect(skills.find((s) => s.name === "dsl-metamodel")).toBeDefined()
			expect(skills.find((s) => s.name === "dsl-tooling")).toBeDefined()
		}
	})

	test("returns exactly 44 skills regardless of provider", () => {
		// given

		// when
		const defaultSkills = createBuiltinSkills()
		const agentBrowserSkills = createBuiltinSkills({ browserProvider: "agent-browser" })

		// then
		expect(defaultSkills).toHaveLength(44)
		expect(agentBrowserSkills).toHaveLength(44)
	})

	test("should exclude playwright when it is in disabledSkills", () => {
		// #given
		const options = { disabledSkills: new Set(["playwright"]) }

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.map((s) => s.name)).not.toContain("playwright")
		expect(skills.map((s) => s.name)).toContain("frontend-ui-ux")
		expect(skills.map((s) => s.name)).toContain("git-master")
		expect(skills.map((s) => s.name)).toContain("dev-browser")
		expect(skills.map((s) => s.name)).toContain("dsl-core")
		expect(skills.length).toBe(43)
	})

	test("should return all skills when disabledSkills set is empty", () => {
		// #given
		const options = { disabledSkills: new Set<string>() }

		// #when
		const skills = createBuiltinSkills(options)

		// #then
		expect(skills.length).toBe(44)
	})

	test("should always include docker-master skill", () => {
		// given
		// when
		const skills = createBuiltinSkills()
		const skillNames = skills.map((s) => s.name)
		// then
		expect(skillNames).toContain("docker-master")
	})

	test("should include all 7 upcoming frontend skills in the result", () => {
		// #given

		// #when
		const skills = createBuiltinSkills()
		const skillNames = skills.map((s) => s.name)

		// #then
		const newSkillNames = [
			"react-nextjs-patterns",
			"svelte-sveltekit-patterns",
			"frontend-a11y",
			"frontend-perf",
			"frontend-testing",
			"frontend-state-data",
			"frontend-build-tooling",
		]
		for (const name of newSkillNames) {
			expect(skillNames).toContain(name)
		}
	})

	test("returns playwright-cli skill when browserProvider is 'playwright-cli'", () => {
		// given
		const options = { browserProvider: "playwright-cli" as const }

		// when
		const skills = createBuiltinSkills(options)

		// then
		const playwrightSkill = skills.find((s) => s.name === "playwright")
		const agentBrowserSkill = skills.find((s) => s.name === "agent-browser")
		expect(playwrightSkill).toBeDefined()
		expect(playwrightSkill?.description).toContain("browser")
		expect(playwrightSkill?.allowedTools).toContain("Bash(playwright-cli:*)")
		expect(playwrightSkill?.mcpConfig).toBeUndefined()
		expect(agentBrowserSkill).toBeUndefined()
	})

	test("playwright-cli skill template contains CLI commands", () => {
		// given
		const options = { browserProvider: "playwright-cli" as const }

		// when
		const skills = createBuiltinSkills(options)
		const skill = skills.find((s) => s.name === "playwright")

		// then
		expect(skill?.template).toContain("playwright-cli open")
		expect(skill?.template).toContain("playwright-cli snapshot")
		expect(skill?.template).toContain("playwright-cli click")
	})
})

describe("lazy skill template loading", () => {
  test("browser skill template is available eagerly", () => {
    // given
    const skills = createBuiltinSkills()

    // when
    const playwright = skills.find((s) => s.name === "playwright")

    // then - browser skill loaded eagerly, template accessible immediately
    expect(playwright).toBeDefined()
    expect(playwright?.template).toBeDefined()
    expect(playwright?.template?.length).toBeGreaterThan(100)
  })

  test("non-browser skill template becomes accessible on first access", () => {
    // given
    const skills = createBuiltinSkills()
    const gitMaster = skills.find((s) => s.name === "git-master")

    // then - template is accessible (loaded lazily, consumer doesn't notice)
    expect(gitMaster).toBeDefined()
    expect(gitMaster?.template).toBeDefined()
    expect(gitMaster?.template?.length).toBeGreaterThan(100)
  })

  test("template access returns expected content for all skills", () => {
    // given
    const skills = createBuiltinSkills()

    // then - all skills have templates
    for (const skill of skills) {
      expect(skill.template).toBeDefined()
      expect(skill.template.length).toBeGreaterThan(0)
    }
  })
})
