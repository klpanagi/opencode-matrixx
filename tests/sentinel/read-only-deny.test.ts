/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createSentinelAgent } from "../../src/agents/sentinel"
import {
  createPermissionEvaluateHandler,
  createSentinelPolicyRules,
} from "../../src/plugin/v2/permission-policy"
import { createAgentToolRestrictions } from "../../src/shared/permission-compat"

type MutableEvaluation = {
  sessionID: string
  action: string
  resources: string[]
  agent?: string
  effect: "allow" | "deny" | "ask"
  message?: string
}

function evaluation(overrides: Partial<MutableEvaluation> = {}): MutableEvaluation {
  return {
    sessionID: "ses_1",
    action: "read",
    resources: [],
    effect: "ask",
    ...overrides,
  }
}

describe("sentinel read-only restriction — V1 agent config", () => {
  test("sentinel agent config denies write, edit, multiedit and task", () => {
    //#given
    const agent = createSentinelAgent("test/model")

    //#when
    const permission = agent.permission as Record<string, string>

    //#then
    expect(permission.write).toBe("deny")
    expect(permission.edit).toBe("deny")
    expect(permission.multiedit).toBe("deny")
    expect(permission.task).toBe("deny")
  })

  test("createAgentToolRestrictions emits deny for every listed tool", () => {
    //#given
    const tools = ["write", "edit", "multiedit", "task"]

    //#when
    const format = createAgentToolRestrictions(tools)

    //#then
    expect(format.permission).toEqual({
      write: "deny",
      edit: "deny",
      multiedit: "deny",
      task: "deny",
    })
  })
})

describe("sentinel read-only restriction — V2 deny policy", () => {
  test("V2 deny policy denies sentinel's write tool via a permission evaluation", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
    })
    const subject = evaluation({ action: "write", agent: "sentinel", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
    expect(subject.message).toContain("read-only")
  })

  test("V2 deny policy denies sentinel's edit, multiedit and task tools", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
    })

    //#when
    const results = await Promise.all(
      ["edit", "multiedit", "task"].map(async (action) => {
        const subject = evaluation({ action, agent: "sentinel" })
        await handler(subject)
        return subject.effect
      })
    )

    //#then
    expect(results).toEqual(["deny", "deny", "deny"])
  })

  test("V2 deny policy leaves a read-only agent's read tool alone", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
    })
    const subject = evaluation({ action: "read", agent: "sentinel", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("ask")
  })

  test("V2 deny policy does not deny the same tool for a different agent", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
    })
    const subject = evaluation({ action: "write", agent: "morpheus", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("ask")
  })

  test("deny-overrides-allow: a user allow policy cannot un-deny sentinel's write tool", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
      policies: [{ effect: "allow", tools: ["write"], reason: "user allow" }],
      agentPermissions: { sentinel: { allow: ["write"] } },
    })
    const subject = evaluation({ action: "write", agent: "sentinel", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
  })

  test("an evaluation without an agent is not denied by the sentinel rule", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentRules: createSentinelPolicyRules(),
    })
    const subject = evaluation({ action: "write", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("ask")
  })
})
