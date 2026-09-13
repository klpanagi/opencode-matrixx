import { describe, expect, it } from "bun:test"

import type { ModelPresetEntry } from "../../../src/config/schema"
import { resolveCategoryConfig } from "../../../src/tools/delegate-task/categories"
import { DEFAULT_CATEGORIES } from "../../../src/tools/delegate-task/constants"

describe("DEFAULT_CATEGORIES", () => {
  it("#given the registry #when inspected #then no entry hardcodes a model string (presets fill models)", () => {
    //#given / #when
    //#then
    for (const [name, entry] of Object.entries(DEFAULT_CATEGORIES)) {
      expect({ name, model: entry.model }).toEqual({ name, model: undefined })
    }
  })

  it("#given the registry #when inspected #then no entry carries a tier field (tiers removed)", () => {
    //#then
    for (const [name, entry] of Object.entries(DEFAULT_CATEGORIES)) {
      expect({ name, tier: (entry as { tier?: unknown }).tier }).toEqual({ name, tier: undefined })
    }
  })

  it("#given the registry #when inspected #then variant defaults are preserved", () => {
    //#then
    expect(DEFAULT_CATEGORIES.source.variant).toBe("max")
    expect(DEFAULT_CATEGORIES["deep-jack"].variant).toBe("max")
    expect(DEFAULT_CATEGORIES["red-pill"].variant).toBe("max")
    expect(DEFAULT_CATEGORIES.construct.variant).toBeUndefined()
  })
})

describe("resolveCategoryConfig with preset-based defaults", () => {
  const SYSTEM_DEFAULT = "anthropic/claude-sonnet-4-5"

  it("#given source category #when resolved without preset #then falls back to systemDefaultModel", () => {
    //#given / #when
    const result = resolveCategoryConfig("source", { systemDefaultModel: SYSTEM_DEFAULT })
    //#then
    expect(result?.model).toBe(SYSTEM_DEFAULT)
    expect(result?.config.variant).toBe("max")
  })

  it("#given presetEntry for category #when resolved #then preset model fills the gap", () => {
    //#given
    const presetEntry: ModelPresetEntry = { model: "anthropic/claude-opus-4-6", variant: "max" }
    //#when
    const result = resolveCategoryConfig("source", { systemDefaultModel: SYSTEM_DEFAULT, presetEntry })
    //#then
    expect(result?.model).toBe("anthropic/claude-opus-4-6")
    expect(result?.config.variant).toBe("max")
  })

  it("#given presetEntry variant #when user has no variant #then preset variant fills", () => {
    //#given
    const presetEntry: ModelPresetEntry = { model: "anthropic/claude-opus-4-6", variant: "max" }
    //#when
    const result = resolveCategoryConfig("construct", { systemDefaultModel: SYSTEM_DEFAULT, presetEntry })
    //#then
    expect(result?.model).toBe("anthropic/claude-opus-4-6")
    expect(result?.config.variant).toBe("max")
  })

  it("#given user model + presetEntry #when resolved #then explicit user model wins", () => {
    //#given
    const presetEntry: ModelPresetEntry = { model: "anthropic/claude-opus-4-6" }
    //#when
    const result = resolveCategoryConfig("source", {
      systemDefaultModel: SYSTEM_DEFAULT,
      presetEntry,
      userCategories: { source: { model: "openai/gpt-5.3-codex" } },
    })
    //#then
    expect(result?.model).toBe("openai/gpt-5.3-codex")
  })

  it("#given no preset and no user model #when resolved #then systemDefaultModel is used", () => {
    //#given / #when
    const result = resolveCategoryConfig("construct", { systemDefaultModel: SYSTEM_DEFAULT })
    //#then
    expect(result?.model).toBe(SYSTEM_DEFAULT)
  })

  it("#given disabled category #when resolved #then returns null", () => {
    //#given
    const userCategories = { source: { disable: true } }
    //#when
    const result = resolveCategoryConfig("source", { systemDefaultModel: SYSTEM_DEFAULT, userCategories })
    //#then
    expect(result).toBeNull()
  })
})
