import { afterEach, describe, expect, test } from "bun:test"
import {
  _resetPresetStateForTesting,
  clearSessionPreset,
  getSessionPreset,
  setSessionPreset,
} from "../../../src/features/preset-state/manager"

afterEach(() => {
  _resetPresetStateForTesting()
})

describe("preset session state", () => {
  test("set then get returns the preset name", () => {
    //#given a session id
    //#when a preset is set
    setSessionPreset("ses-1", "eco")

    //#then it reads back
    expect(getSessionPreset("ses-1")).toBe("eco")
  })

  test("unknown session returns undefined", () => {
    //#given no state
    //#when queried
    //#then undefined
    expect(getSessionPreset("nope")).toBeUndefined()
  })

  test("clear removes the overlay", () => {
    //#given a set overlay
    setSessionPreset("ses-1", "eco")

    //#when cleared
    clearSessionPreset("ses-1")

    //#then gone
    expect(getSessionPreset("ses-1")).toBeUndefined()
  })

  test("sessions are independent", () => {
    //#given two sessions
    setSessionPreset("ses-1", "eco")
    setSessionPreset("ses-2", "flagship")

    //#when read
    //#then each keeps its own value
    expect(getSessionPreset("ses-1")).toBe("eco")
    expect(getSessionPreset("ses-2")).toBe("flagship")
  })

  test("set overwrites previous value", () => {
    //#given an existing overlay
    setSessionPreset("ses-1", "eco")

    //#when overwritten
    setSessionPreset("ses-1", "flagship")

    //#then latest wins
    expect(getSessionPreset("ses-1")).toBe("flagship")
  })
})
