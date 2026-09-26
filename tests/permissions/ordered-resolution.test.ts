/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"
import {
  PERMISSION_EFFECT_PRECEDENCE,
  type PermissionRule,
  resolvePermissionEffect,
} from "../../src/plugin/v2/permission-policy"

describe("PERMISSION_EFFECT_PRECEDENCE", () => {
  test("deny outranks ask which outranks allow", () => {
    //#given
    const expected = ["deny", "ask", "allow"] as const

    //#when
    const actual = PERMISSION_EFFECT_PRECEDENCE

    //#then
    expect(actual).toEqual(expected)
  })
})

describe("resolvePermissionEffect — deny precedence", () => {
  test("deny wins over allow regardless of rule order", () => {
    //#given
    const allowFirst: PermissionRule[] = [
      { effect: "allow", tools: ["write"] },
      { effect: "deny", tools: ["write"], reason: "read-only agent" },
    ]
    const denyFirst: PermissionRule[] = [
      { effect: "deny", tools: ["write"], reason: "read-only agent" },
      { effect: "allow", tools: ["write"] },
    ]
    const target = { action: "write", agent: "sentinel" }

    //#when
    const allowFirstResult = resolvePermissionEffect(allowFirst, target)
    const denyFirstResult = resolvePermissionEffect(denyFirst, target)

    //#then
    expect(allowFirstResult?.effect).toBe("deny")
    expect(denyFirstResult?.effect).toBe("deny")
  })

  test("deny wins over ask regardless of rule order", () => {
    //#given
    const rules: PermissionRule[] = [
      { effect: "ask", tools: ["bash"] },
      { effect: "deny", tools: ["bash"], reason: "no shell for auditors" },
    ]

    //#when
    const result = resolvePermissionEffect(rules, { action: "bash", agent: "sentinel" })

    //#then
    expect(result?.effect).toBe("deny")
    expect(result?.reason).toBe("no shell for auditors")
  })

  test("ask wins over allow when no deny matches", () => {
    //#given
    const rules: PermissionRule[] = [
      { effect: "allow", tools: ["webfetch"] },
      { effect: "ask", tools: ["webfetch"] },
    ]

    //#when
    const result = resolvePermissionEffect(rules, { action: "webfetch" })

    //#then
    expect(result?.effect).toBe("ask")
  })

  test("the reason reported is the first matching rule of the winning effect", () => {
    //#given
    const rules: PermissionRule[] = [
      { effect: "deny", tools: ["write"], reason: "first" },
      { effect: "deny", tools: ["write"], reason: "second" },
    ]

    //#when
    const result = resolvePermissionEffect(rules, { action: "write" })

    //#then
    expect(result?.reason).toBe("first")
  })
})

describe("resolvePermissionEffect — matching", () => {
  test("returns null when no rule matches, so the runtime effect is untouched", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", tools: ["write"] }]

    //#when
    const result = resolvePermissionEffect(rules, { action: "read" })

    //#then
    expect(result).toBeNull()
  })

  test("an empty rule list resolves to null", () => {
    //#given
    const rules: PermissionRule[] = []

    //#when
    const result = resolvePermissionEffect(rules, { action: "read" })

    //#then
    expect(result).toBeNull()
  })

  test("tool matching is case-insensitive", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", tools: ["Write"] }]

    //#when
    const result = resolvePermissionEffect(rules, { action: "write" })

    //#then
    expect(result?.effect).toBe("deny")
  })

  test("a rule with no selector matches every action", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", reason: "global lockdown" }]

    //#when
    const result = resolvePermissionEffect(rules, { action: "anything" })

    //#then
    expect(result?.effect).toBe("deny")
  })

  test("an agent-scoped rule does not match when the evaluation carries no agent", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", agents: ["sentinel"] }]

    //#when
    const result = resolvePermissionEffect(rules, { action: "read" })

    //#then
    expect(result).toBeNull()
  })

  test("an agent-scoped rule matches its agent only", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", agents: ["sentinel"] }]

    //#when
    const sentinel = resolvePermissionEffect(rules, { action: "read", agent: "sentinel" })
    const other = resolvePermissionEffect(rules, { action: "read", agent: "morpheus" })

    //#then
    expect(sentinel?.effect).toBe("deny")
    expect(other).toBeNull()
  })

  test("tool and agent selectors are ANDed", () => {
    //#given
    const rules: PermissionRule[] = [
      { effect: "deny", tools: ["write"], agents: ["sentinel"] },
    ]

    //#when
    const both = resolvePermissionEffect(rules, { action: "write", agent: "sentinel" })
    const toolOnly = resolvePermissionEffect(rules, { action: "write", agent: "morpheus" })
    const agentOnly = resolvePermissionEffect(rules, { action: "read", agent: "sentinel" })

    //#then
    expect(both?.effect).toBe("deny")
    expect(toolOnly).toBeNull()
    expect(agentOnly).toBeNull()
  })

  test("a pattern with a single star matches any action containing the stem", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", pattern: "multi*" }]

    //#when
    const hit = resolvePermissionEffect(rules, { action: "multiedit" })
    const miss = resolvePermissionEffect(rules, { action: "edit" })

    //#then
    expect(hit?.effect).toBe("deny")
    expect(miss).toBeNull()
  })

  test("a pattern of a single star matches every action", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "ask", pattern: "*" }]

    //#when
    const result = resolvePermissionEffect(rules, { action: "anything" })

    //#then
    expect(result?.effect).toBe("ask")
  })

  test("an exact pattern matches only the exact action", () => {
    //#given
    const rules: PermissionRule[] = [{ effect: "deny", pattern: "write" }]

    //#when
    const hit = resolvePermissionEffect(rules, { action: "write" })
    const miss = resolvePermissionEffect(rules, { action: "write_file" })

    //#then
    expect(hit?.effect).toBe("deny")
    expect(miss).toBeNull()
  })

  test("a pattern is ANDed with tools", () => {
    //#given
    const rules: PermissionRule[] = [
      { effect: "deny", tools: ["multiedit"], pattern: "multi*" },
    ]

    //#when
    const result = resolvePermissionEffect(rules, { action: "multiedit" })

    //#then
    expect(result?.effect).toBe("deny")
  })
})
