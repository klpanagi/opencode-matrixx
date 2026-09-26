/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import { createPermissionEvaluateHandler } from "../../src/plugin/v2/permission-policy"

type MutableEvaluation = {
  sessionID: string
  action: string
  resources: string[]
  agent?: string
  effect: "allow" | "deny" | "ask"
  message?: string
}

function evaluation(
  overrides: Partial<MutableEvaluation> = {}
): MutableEvaluation {
  return {
    sessionID: "ses_1",
    action: "read",
    resources: [],
    effect: "ask",
    ...overrides,
  }
}

describe("createPermissionEvaluateHandler — experimental.policies enforcement", () => {
  test("an experimental deny policy denies the matching action", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [{ effect: "deny", tools: ["bash"], reason: "shell disabled by policy" }],
    })
    const subject = evaluation({ action: "bash" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
    expect(subject.message).toBe("shell disabled by policy")
  })

  test("an experimental allow policy sets the effect to allow", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [{ effect: "allow", tools: ["read"] }],
    })
    const subject = evaluation({ action: "read" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("allow")
  })

  test("an unmatched action is left untouched", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [{ effect: "deny", tools: ["bash"] }],
    })
    const subject = evaluation({ action: "read", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("ask")
    expect(subject.message).toBeUndefined()
  })

  test("a deny policy beats an allow policy for the same action", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [
        { effect: "allow", tools: ["write"] },
        { effect: "deny", tools: ["write"], reason: "no writes" },
      ],
    })
    const subject = evaluation({ action: "write", effect: "ask" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
  })

  test("a policy with no reason still denies with a generic message", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [{ effect: "deny", tools: ["bash"] }],
    })
    const subject = evaluation({ action: "bash" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
    expect(subject.message).toBeTruthy()
  })
})

describe("createPermissionEvaluateHandler — per-agent permissions", () => {
  test("an agent-scoped deny denies for that agent only", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentPermissions: { cipher: { deny: ["bash"] } },
    })
    const denied = evaluation({ action: "bash", agent: "cipher" })
    const other = evaluation({ action: "bash", agent: "morpheus" })

    //#when
    await handler(denied)
    await handler(other)

    //#then
    expect(denied.effect).toBe("deny")
    expect(other.effect).toBe("ask")
  })

  test("an agent deny beats an agent allow from the same permissions block", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      agentPermissions: { cipher: { allow: ["bash"], deny: ["bash"] } },
    })
    const subject = evaluation({ action: "bash", agent: "cipher" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
  })

  test("a global experimental allow does not override an agent deny", async () => {
    //#given
    const handler = createPermissionEvaluateHandler({
      policies: [{ effect: "allow", tools: ["bash"] }],
      agentPermissions: { cipher: { deny: ["bash"] } },
    })
    const subject = evaluation({ action: "bash", agent: "cipher" })

    //#when
    await handler(subject)

    //#then
    expect(subject.effect).toBe("deny")
  })
})
