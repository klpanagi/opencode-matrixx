import { afterEach, describe, expect, test } from "bun:test"
import { _resetPresetStateForTesting, setSessionPreset } from "../../../src/features/preset-state/manager"
import { resolveCategoryConfig } from "../../../src/tools/delegate-task/categories"

afterEach(() => {
  _resetPresetStateForTesting()
})

const BASE = {
  userCategories: {},
  systemDefaultModel: "s/fallback",
} as Parameters<typeof resolveCategoryConfig>[1]

describe("delegate-task preset overlay", () => {
  test("preset entry fills a category with no explicit model", () => {
    //#given a preset entry and no user model
    //#when resolved
    const resolved = resolveCategoryConfig("bullet-time", {
      ...BASE,
      presetEntry: { model: "p/fast" },
    })

    //#then the preset model is used
    expect(resolved?.model).toBe("p/fast")
  })

  test("explicit user model wins over preset entry", () => {
    //#given both a user model and a preset entry
    //#when resolved
    const resolved = resolveCategoryConfig("source", {
      ...BASE,
      userCategories: { source: { model: "p/explicit" } },
      presetEntry: { model: "p/preset" },
    })

    //#then the explicit model wins
    expect(resolved?.model).toBe("p/explicit")
  })

  test("no preset entry falls back to system default", () => {
    //#given neither user model nor preset entry
    //#when resolved
    const resolved = resolveCategoryConfig("source", { ...BASE })

    //#then system default applies (unchanged legacy behavior)
    expect(resolved?.model).toBe("s/fallback")
  })

  test("session overlay composes through resolveCategoryConfig options", () => {
    //#given a stored session overlay (as resolveCategoryExecution would read it)
    setSessionPreset("ses-parent", "eco")

    //#when the overlay name is threaded as a preset entry
    const resolved = resolveCategoryConfig("source", {
      ...BASE,
      presetEntry: { model: "p/overlay" },
    })

    //#then it takes effect for the delegated call
    expect(resolved?.model).toBe("p/overlay")
  })
})
