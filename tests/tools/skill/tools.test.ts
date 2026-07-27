import { afterAll, describe, expect, it, mock } from "bun:test"
import * as fs from "node:fs"
import type { ToolContext } from "@opencode-ai/plugin/tool"
import type { LoadedSkill } from "../../../src/features/opencode-skill-loader/types"
import { createSkillTool } from "../../../src/tools/skill/tools"

const originalReadFileSync = fs.readFileSync.bind(fs)

mock.module("node:fs", () => ({
  ...fs,
  readFileSync: (path: string, encoding?: string) => {
    if (typeof path === "string" && path.includes("/skills/")) {
      return `---
description: Test skill description
---
Test skill body content`
    }
    return originalReadFileSync(path, encoding as BufferEncoding)
  },
}))

afterAll(() => {
  mock.restore()
})

function createMockSkill(name: string, options: { agent?: string } = {}): LoadedSkill {
  return {
    name,
    path: `/test/skills/${name}/SKILL.md`,
    resolvedPath: `/test/skills/${name}`,
    definition: {
      name,
      description: `Test skill ${name}`,
      template: "Test template",
      agent: options.agent,
    },
    scope: "opencode-project",
  }
}


const mockContext: ToolContext = {
  sessionID: "test-session",
  messageID: "msg-1",
  agent: "test-agent",
  directory: "/test",
  worktree: "/test",
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
}

describe("skill tool - synchronous description", () => {
  it("includes available_skills immediately when skills are pre-provided", () => {
    // given
    const loadedSkills = [createMockSkill("test-skill")]

    // when
    const tool = createSkillTool({ skills: loadedSkills })

    // then
    expect(tool.description).toContain("<available_skills>")
    expect(tool.description).toContain("test-skill")
  })

  it("includes all pre-provided skills in available_skills immediately", () => {
    // given
    const loadedSkills = [
      createMockSkill("playwright"),
      createMockSkill("frontend-ui-ux"),
      createMockSkill("git-master"),
    ]

    // when
    const tool = createSkillTool({ skills: loadedSkills })

    // then
    expect(tool.description).toContain("playwright")
    expect(tool.description).toContain("frontend-ui-ux")
    expect(tool.description).toContain("git-master")
  })

  it("shows no-skills message immediately when empty skills are pre-provided", () => {
    // given / #when
    const tool = createSkillTool({ skills: [] })

    // then
    expect(tool.description).toContain("No skills are currently available")
  })
})

