/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test"

import type { AdmissionFacts, ProgressFacts } from "../../../src/features/completion-review/gather-types"
import {
  evaluateAdmission,
  GATE_HEURISTIC_WARNING,
  UNAVAILABLE_EVIDENCE_GAP,
} from "../../../src/features/completion-review/admission-gate"

function progress(over: Partial<ProgressFacts> = {}): ProgressFacts {
  const total = over.total ?? 4
  const completed = over.completed ?? total
  return {
    total,
    completed,
    remaining: total - completed,
    isComplete: over.isComplete ?? completed === total,
    needsTriage: over.needsTriage ?? total === 0,
    ...over,
  }
}

function admission(over: Partial<AdmissionFacts> = {}): AdmissionFacts {
  const linked = over.linkedTerminalTasks ?? []
  const stamps = over.notepadCompletionStamps ?? []
  return {
    linkedTerminalTasks: linked,
    notepadCompletionStamps: stamps,
    notepads: [],
    corroborationCount: over.corroborationCount ?? linked.length + stamps.length,
  }
}

const terminal = (id: string) => ({ id, status: "completed", terminal: true })

describe("evaluateAdmission — admission gate", () => {
  test("admits on the conjunction: complete, non-vacuous, and independently corroborated", () => {
    //#given a plan whose checkboxes are all ticked AND four terminal tasks back it
    const input = {
      progress: progress({ total: 4, completed: 4 }),
      admission: admission({
        linkedTerminalTasks: [terminal("T-1"), terminal("T-2"), terminal("T-3"), terminal("T-4")],
        notepadCompletionStamps: ["T-1", "T-2"],
      }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then the signals agree and the conjunction is satisfied
    expect(decision.outcome).toBe("admitted")
    expect(decision.gateState).toBe("agree")
    expect(decision.gateEvidence).toBe("corroborated")
    expect(decision.admittedBy).toBe("corroboration")
    expect(decision.gateDisagreement).toBeNull()
  })

  test("records which signal admitted the plan", () => {
    //#given the same corroborated plan
    const input = {
      progress: progress({ total: 2, completed: 2 }),
      admission: admission({ linkedTerminalTasks: [terminal("T-1"), terminal("T-2")] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then the admitting signal is named, never left implicit
    expect(decision.admittedBy).not.toBeNull()
    expect(["checkboxes", "corroboration"]).toContain(decision.admittedBy)
  })

  test("PROCEEDS and records a disagreement when the signals conflict", () => {
    //#given checkboxes say complete but only one of five tasks is terminal
    const input = {
      progress: progress({ total: 5, completed: 5 }),
      admission: admission({ linkedTerminalTasks: [terminal("T-1")], notepadCompletionStamps: [] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then it proceeds, names BOTH signals, and resolves to "proceed"
    expect(decision.outcome).toBe("admitted")
    expect(decision.gateState).toBe("disagree")
    expect(decision.gateDisagreement).not.toBeNull()
    expect(decision.gateDisagreement?.checkboxesSaysComplete).toBe(true)
    expect(decision.gateDisagreement?.corroborationSaysComplete).toBe(false)
    expect(decision.gateDisagreement?.resolved).toBe("proceed")
    expect(decision.gateDisagreement?.reason.length).toBeGreaterThan(0)
  })

  test("structural absence is 'unavailable' and NEVER a fake disagreement", () => {
    //#given a complete plan with zero linked tasks AND zero completion stamps
    const input = {
      progress: progress({ total: 3, completed: 3 }),
      admission: admission({ linkedTerminalTasks: [], notepadCompletionStamps: [] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then the evidence is unavailable, the gap is named, and NO disagreement is invented
    expect(decision.outcome).toBe("admitted")
    expect(decision.gateState).toBe("unavailable")
    expect(decision.gateEvidence).toBe("unavailable")
    expect(decision.gateDisagreement).toBeNull()
    expect(decision.reason).toContain("0 of 48")
    expect(decision.reason).toContain("1 of 19")
  })

  test("hard-refuses vacuous completeness (needsTriage) before consulting isComplete", () => {
    //#given a zero-checkbox plan, which arrives with isComplete: true by vacuity
    const input = {
      progress: progress({ total: 0, completed: 0, isComplete: true, needsTriage: true }),
      admission: admission({ linkedTerminalTasks: [], notepadCompletionStamps: [] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then vacuity wins over the vacuous isComplete
    expect(decision.outcome).toBe("refused")
    expect(decision.refuseCause).toBe("vacuous_completeness")
    expect(decision.gateDisagreement).toBeNull()
  })

  test("hard-refuses an unfinished plan (both signals say incomplete)", () => {
    //#given a plan with two of five tasks done and no terminal corroboration
    const input = {
      progress: progress({ total: 5, completed: 2, isComplete: false, needsTriage: false }),
      admission: admission({ linkedTerminalTasks: [], notepadCompletionStamps: [] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then the review is refused as not-yet-scorable
    expect(decision.outcome).toBe("refused")
    expect(decision.refuseCause).toBe("execution_incomplete")
    expect(decision.admittedBy).toBeNull()
  })

  test("NEVER admits on isComplete alone when corroboration is present but insufficient", () => {
    //#given isComplete: true with a single stamp against a four-task plan
    const input = {
      progress: progress({ total: 4, completed: 4, isComplete: true, needsTriage: false }),
      admission: admission({ linkedTerminalTasks: [], notepadCompletionStamps: ["T-1"] }),
    }

    //#when the gate is evaluated
    const decision = evaluateAdmission(input)

    //#then the signal that carried the admission is the conjunction, not the checkbox
    expect(decision.gateState).toBe("disagree")
    expect(decision.gateDisagreement?.checkboxesSaysComplete).toBe(true)
    expect(decision.gateDisagreement?.corroborationSaysComplete).toBe(false)
  })

  test("states the gate's own status honestly — it may be wrong in BOTH directions", () => {
    //#given the exported honesty notice
    //#when its text is read
    //#then it names both failure directions of the heuristic
    expect(GATE_HEURISTIC_WARNING).toMatch(/refuse/i)
    expect(GATE_HEURISTIC_WARNING).toMatch(/admit/i)
    expect(GATE_HEURISTIC_WARNING).toMatch(/heuristic/i)
  })
})
