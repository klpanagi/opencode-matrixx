import { describe, expect, it } from "bun:test"

import { DEPRECATED_PROFILES, deprecationMessage, isDeprecatedProfile } from "./deprecated-profiles"

describe("DEPRECATED_PROFILES", () => {
  it("#given the registry #when inspected #then contains the 5 vendor-specific profile names", () => {
    //#then
    expect(DEPRECATED_PROFILES).toContain("go")
    expect(DEPRECATED_PROFILES).toContain("xiaomi-ultimate")
    expect(DEPRECATED_PROFILES).toContain("go-ultimate")
    expect(DEPRECATED_PROFILES).toContain("go-trio")
    expect(DEPRECATED_PROFILES).toContain("go-duo")
  })

  it("#given the registry #when iterated #then does NOT contain the 5 tier profiles (free/budget/economy/balanced/performance)", () => {
    //#then
    for (const tier of ["free", "budget", "economy", "balanced", "performance"]) {
      expect(DEPRECATED_PROFILES).not.toContain(tier)
    }
  })

  it("#given the registry #when length checked #then is exactly 5 (no leftovers)", () => {
    //#then
    expect(DEPRECATED_PROFILES).toHaveLength(5)
  })
})

describe("isDeprecatedProfile", () => {
  it("#given a vendor profile name #when checked #then returns true", () => {
    //#given / #when / #then
    expect(isDeprecatedProfile("go")).toBe(true)
    expect(isDeprecatedProfile("xiaomi-ultimate")).toBe(true)
    expect(isDeprecatedProfile("go-duo")).toBe(true)
  })

  it("#given a tier profile name #when checked #then returns false", () => {
    //#then
    expect(isDeprecatedProfile("free")).toBe(false)
    expect(isDeprecatedProfile("balanced")).toBe(false)
    expect(isDeprecatedProfile("performance")).toBe(false)
  })

  it("#given an unknown profile name #when checked #then returns false", () => {
    //#then
    expect(isDeprecatedProfile("nonexistent")).toBe(false)
    expect(isDeprecatedProfile("")).toBe(false)
  })
})

describe("deprecationMessage", () => {
  it("#given any vendor profile name #when message generated #then mentions v3.0.0 and migration helper", () => {
    //#when
    const msg = deprecationMessage("go")

    //#then
    expect(msg).toContain("go")
    expect(msg).toContain("v3.0.0")
    expect(msg).toContain("migrateProfileToTiers")
  })

  it("#given any vendor profile name #when message generated #then is deterministic (same output for same input)", () => {
    //#then
    expect(deprecationMessage("go")).toBe(deprecationMessage("go"))
    expect(deprecationMessage("go-duo")).toBe(deprecationMessage("go-duo"))
  })
})
