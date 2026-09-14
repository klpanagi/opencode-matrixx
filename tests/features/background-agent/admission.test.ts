/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { classifyAdmission } from "../../../src/features/background-agent/admission"
import { _resetForTesting, registerSubagentSession } from "../../../src/features/session-state"

describe("classifyAdmission", () => {
  beforeEach(() => {
    _resetForTesting()
  })

  afterEach(() => {
    _resetForTesting()
  })

  test("empty registry returns root", () => {
    //#given an empty session registry
    //#when classifying an arbitrary parent session
    const result = classifyAdmission("ses_unknown", 2)

    //#then it is treated as a root launch
    expect(result).toEqual({ kind: "root" })
  })

  test("unknown parent session returns root", () => {
    //#given a registry holding an unrelated subagent session
    registerSubagentSession("ses_other_child", "ses_other_parent")

    //#when classifying a session that is not registered
    const result = classifyAdmission("ses_unregistered", 2)

    //#then it is treated as a root launch
    expect(result).toEqual({ kind: "root" })
  })

  test("one registered hop returns nested depth 1", () => {
    //#given a managed session whose parent is the main session
    registerSubagentSession("ses_child", "ses_parent")

    //#when classifying the managed session
    const result = classifyAdmission("ses_child", 2)

    //#then it is nested at depth 1
    expect(result).toEqual({ kind: "nested", depth: 1 })
  })

  test("two registered hops returns nested depth 2", () => {
    //#given a managed session nested two levels below the main session
    registerSubagentSession("ses_child", "ses_mid")
    registerSubagentSession("ses_mid", "ses_root")

    //#when classifying the deepest managed session
    const result = classifyAdmission("ses_child", 4)

    //#then it is nested at depth 2
    expect(result).toEqual({ kind: "nested", depth: 2 })
  })

  test("chain longer than maxDepth is capped at maxDepth", () => {
    //#given a managed session nested four levels below the main session
    registerSubagentSession("ses_a", "ses_b")
    registerSubagentSession("ses_b", "ses_c")
    registerSubagentSession("ses_c", "ses_d")
    registerSubagentSession("ses_d", "ses_root")

    //#when classifying with a maxDepth of 2
    const result = classifyAdmission("ses_a", 2)

    //#then the reported depth is capped at 2
    expect(result).toEqual({ kind: "nested", depth: 2 })
  })

  test("undefined parent session returns root", () => {
    //#given a managed session with a registered chain
    registerSubagentSession("ses_child", "ses_parent")

    //#when classifying an undefined parent session
    const result = classifyAdmission(undefined, 2)

    //#then it fails open to a root launch
    expect(result).toEqual({ kind: "root" })
  })

  test("empty parent session returns root", () => {
    //#given a managed session with a registered chain
    registerSubagentSession("ses_child", "ses_parent")

    //#when classifying an empty parent session id
    const result = classifyAdmission("", 2)

    //#then it fails open to a root launch
    expect(result).toEqual({ kind: "root" })
  })
})
