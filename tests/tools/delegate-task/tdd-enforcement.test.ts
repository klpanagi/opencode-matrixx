/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import * as delegateTools from "../../../src/tools/delegate-task/tools"

type TddGuardFn = (category: string | undefined, loadSkills: string[]) => string | null

const guard = (delegateTools as unknown as { requireTddEnforcerForCodeWriting?: TddGuardFn })
  .requireTddEnforcerForCodeWriting

describe("requireTddEnforcerForCodeWriting (issue #127)", () => {
  test("source + [] returns error naming tdd-enforcer and docs/quality.md", () => {
    //#given
    const category = "source"
    const loadSkills: string[] = []

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(typeof error).toBe("string")
    expect(String(error)).toContain("tdd-enforcer")
    expect(String(error)).toContain("docs/quality.md")
  })

  test("source without the skill returns enforcement error", () => {
    //#given
    const category = "source"
    const loadSkills = ["git-master"]

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(typeof error).toBe("string")
    expect(String(error)).toContain("tdd-enforcer")
  })

  test("source with tdd-enforcer passes through (null)", () => {
    //#given
    const category = "source"
    const loadSkills = ["tdd-enforcer"]

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(error).toBeNull()
  })

  test("source with tdd-enforcer among other skills passes through (null)", () => {
    //#given
    const category = "source"
    const loadSkills = ["git-master", "tdd-enforcer"]

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(error).toBeNull()
  })

  test("non-source category with [] is allowed (null)", () => {
    //#given
    const category = "blue-pill"
    const loadSkills: string[] = []

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(error).toBeNull()
  })

  test("undefined category with [] is allowed (null)", () => {
    //#given
    const category: string | undefined = undefined
    const loadSkills: string[] = []

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(error).toBeNull()
  })

  test("source rejection names load_skills, writes-code reason, and Part B pointer", () => {
    //#given
    const category = "source"
    const loadSkills: string[] = []

    //#when
    expect(typeof guard).toBe("function")
    const error = guard?.(category, loadSkills)

    //#then
    expect(typeof error).toBe("string")
    expect(String(error)).toContain("load_skills")
    expect(String(error)).toContain("writes code")
    expect(String(error)).toContain("Part B")
  })
})
