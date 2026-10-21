/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"
import {
  PLAN_STATUS_ORDER,
  isPlanStatusTransitionAllowed,
  isPlanComplete,
} from "../../../src/features/plan-contract/schema"

describe("plan status forward-only transitions", () => {
  test("allows pending -> in_progress -> completed", () => {
    //#given a fresh plan lifecycle
    //#when checking each forward step
    //#then both forward steps are allowed
    expect(isPlanStatusTransitionAllowed("pending", "in_progress")).toBe(true)
    expect(isPlanStatusTransitionAllowed("in_progress", "completed")).toBe(true)
  })

  test("rejects backward jump without explicit flag", () => {
    //#given a completed plan
    //#when attempting a backward transition without force
    //#then the transition is rejected
    expect(isPlanStatusTransitionAllowed("completed", "in_progress")).toBe(false)
    expect(isPlanStatusTransitionAllowed("in_progress", "pending")).toBe(false)
    expect(isPlanStatusTransitionAllowed("completed", "pending")).toBe(false)
  })

  test("explicit forceCompletion flag overrides backward-jump rejection", () => {
    //#given a completed plan and an explicit override
    //#when forcing a backward transition
    //#then the override is honored
    expect(isPlanStatusTransitionAllowed("completed", "in_progress", { forceCompletion: true })).toBe(true)
  })

  test("same-status rewrite is allowed (idempotent)", () => {
    //#given a plan rewritten without a status change
    //#when checking the identity transition
    //#then it is allowed
    expect(isPlanStatusTransitionAllowed("pending", "pending")).toBe(true)
  })

  test("AND-gate: plan is complete only when checkboxes done AND status completed", () => {
    //#given checkbox state plus front-matter status
    //#when evaluating completion
    //#then both must agree unless forceCompletion overrides
    expect(isPlanComplete({ allChecked: true, status: "completed" })).toBe(true)
    expect(isPlanComplete({ allChecked: true, status: "in_progress" })).toBe(false)
    expect(isPlanComplete({ allChecked: false, status: "completed" })).toBe(false)
    expect(
      isPlanComplete({ allChecked: false, status: "in_progress", forceCompletion: true }),
    ).toBe(true)
  })

  test("status order is documented and frozen", () => {
    //#given the canonical order
    //#when reading it
    //#then it matches pending -> in_progress -> completed
    expect([...PLAN_STATUS_ORDER]).toEqual(["pending", "in_progress", "completed"])
  })
})
