/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  directoryHasMatch,
  isConstructAgentEnabled,
  shouldEnableBddTools,
  shouldEnableEvolutionTool,
  shouldEnableKnowledgeHubConfirm,
  shouldEnableLookAt,
  shouldEnablePdfFigures,
  shouldEnablePresetTools,
} from "../../src/plugin/tool-gating"

describe("tool-gating", () => {
  let dir: string

  beforeEach(() => {
    //#given
    dir = mkdtempSync(join(tmpdir(), "matrixx-tool-gating-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe("directoryHasMatch", () => {
    test("finds a .feature file in the directory", () => {
      //#given
      writeFileSync(join(dir, "login.feature"), "Feature: login")

      //#when
      const result = directoryHasMatch(dir, [".feature"])

      //#then
      expect(result).toBe(true)
    })

    test("finds a .pdf file in a nested subdirectory", () => {
      //#given
      mkdirSync(join(dir, "docs"))
      writeFileSync(join(dir, "docs", "spec.pdf"), "%PDF")

      //#when
      const result = directoryHasMatch(dir, [".pdf"])

      //#then
      expect(result).toBe(true)
    })

    test("returns false for an empty directory", () => {
      //#given
      const empty = dir

      //#when
      const result = directoryHasMatch(empty, [".feature"])

      //#then
      expect(result).toBe(false)
    })

    test("returns false when the directory does not exist", () => {
      //#given
      const missing = join(dir, "does-not-exist")

      //#when
      const result = directoryHasMatch(missing, [".feature"])

      //#then
      expect(result).toBe(false)
    })

    test("returns false when directory is undefined or empty", () => {
      //#given
      const noDir = undefined

      //#when
      const undefinedResult = directoryHasMatch(noDir, [".feature"])
      const emptyResult = directoryHasMatch("", [".feature"])

      //#then
      expect(undefinedResult).toBe(false)
      expect(emptyResult).toBe(false)
    })

    test("skips node_modules and .git directories", () => {
      //#given
      mkdirSync(join(dir, "node_modules"), { recursive: true })
      writeFileSync(join(dir, "node_modules", "hidden.feature"), "Feature: hidden")
      mkdirSync(join(dir, ".git"), { recursive: true })
      writeFileSync(join(dir, ".git", "other.feature"), "Feature: other")

      //#when
      const result = directoryHasMatch(dir, [".feature"])

      //#then
      expect(result).toBe(false)
    })

    test("matches media extensions case-insensitively", () => {
      //#given
      writeFileSync(join(dir, "shot.PNG"), "data")

      //#when
      const result = directoryHasMatch(dir, [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf"])

      //#then
      expect(result).toBe(true)
    })
  })

  describe("isConstructAgentEnabled", () => {
    test("returns true when no agents are disabled", () => {
      //#given
      const disabled = undefined

      //#when
      const result = isConstructAgentEnabled(disabled)

      //#then
      expect(result).toBe(true)
    })

    test("returns false when construct is disabled (case-insensitive)", () => {
      //#given
      const disabled = ["Construct"]

      //#when
      const result = isConstructAgentEnabled(disabled)

      //#then
      expect(result).toBe(false)
    })

    test("returns true when other agents are disabled", () => {
      //#given
      const disabled = ["oracle"]

      //#when
      const result = isConstructAgentEnabled(disabled)

      //#then
      expect(result).toBe(true)
    })
  })

  describe("shouldEnableBddTools", () => {
    test("auto-registers when a .feature file exists", () => {
      //#given
      writeFileSync(join(dir, "a.feature"), "Feature: a")

      //#when
      const result = shouldEnableBddTools(dir, undefined)

      //#then
      expect(result).toBe(true)
    })

    test("auto-skips when no .feature file exists", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnableBddTools(emptyDir, undefined)

      //#then
      expect(result).toBe(false)
    })

    test("explicit true forces registration without files", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnableBddTools(emptyDir, true)

      //#then
      expect(result).toBe(true)
    })

    test("explicit false forces skip even with files present", () => {
      //#given
      writeFileSync(join(dir, "a.feature"), "Feature: a")

      //#when
      const result = shouldEnableBddTools(dir, false)

      //#then
      expect(result).toBe(false)
    })
  })

  describe("shouldEnablePdfFigures", () => {
    test("auto-registers when a .pdf file exists", () => {
      //#given
      writeFileSync(join(dir, "doc.pdf"), "%PDF")

      //#when
      const result = shouldEnablePdfFigures(dir, undefined)

      //#then
      expect(result).toBe(true)
    })

    test("auto-skips when no .pdf file exists", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnablePdfFigures(emptyDir, undefined)

      //#then
      expect(result).toBe(false)
    })

    test("explicit true forces registration without files", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnablePdfFigures(emptyDir, true)

      //#then
      expect(result).toBe(true)
    })

    test("explicit false forces skip even with files present", () => {
      //#given
      writeFileSync(join(dir, "doc.pdf"), "%PDF")

      //#when
      const result = shouldEnablePdfFigures(dir, false)

      //#then
      expect(result).toBe(false)
    })
  })

  describe("shouldEnableLookAt", () => {
    test("registers when construct is enabled and a media file exists", () => {
      //#given
      writeFileSync(join(dir, "shot.png"), "data")

      //#when
      const result = shouldEnableLookAt(dir, true, undefined)

      //#then
      expect(result).toBe(true)
    })

    test("skips when no media file exists", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnableLookAt(emptyDir, true, undefined)

      //#then
      expect(result).toBe(false)
    })

    test("skips when construct agent is disabled even with media present", () => {
      //#given
      writeFileSync(join(dir, "shot.png"), "data")

      //#when
      const result = shouldEnableLookAt(dir, false, undefined)

      //#then
      expect(result).toBe(false)
    })

    test("explicit true overrides both construct gate and media scan", () => {
      //#given
      const emptyDir = dir

      //#when
      const result = shouldEnableLookAt(emptyDir, false, true)

      //#then
      expect(result).toBe(true)
    })

    test("explicit false forces skip even with media and construct enabled", () => {
      //#given
      writeFileSync(join(dir, "shot.png"), "data")

      //#when
      const result = shouldEnableLookAt(dir, true, false)

      //#then
      expect(result).toBe(false)
    })
  })

  describe("shouldEnableKnowledgeHubConfirm", () => {
    test("registers when hubs are configured", () => {
      //#given
      const hubs = [{ name: "hub", path: "/tmp/hub", index: "_index.md", scope: "global", mode: "router-only", exclude: [] }]

      //#when
      const result = shouldEnableKnowledgeHubConfirm(hubs)

      //#then
      expect(result).toBe(true)
    })

    test("skips when hubs list is empty", () => {
      //#given
      const hubs: Array<Record<string, unknown>> = []

      //#when
      const result = shouldEnableKnowledgeHubConfirm(hubs)

      //#then
      expect(result).toBe(false)
    })

    test("skips when hubs is undefined", () => {
      //#given
      const hubs = undefined

      //#when
      const result = shouldEnableKnowledgeHubConfirm(hubs)

      //#then
      expect(result).toBe(false)
    })
  })

  describe("shouldEnablePresetTools", () => {
    test("defaults to false when override is undefined", () => {
      //#given
      const override = undefined

      //#when
      const result = shouldEnablePresetTools(override)

      //#then
      expect(result).toBe(false)
    })

    test("registers when explicitly enabled", () => {
      //#given
      const override = true

      //#when
      const result = shouldEnablePresetTools(override)

      //#then
      expect(result).toBe(true)
    })

    test("skips when explicitly disabled", () => {
      //#given
      const override = false

      //#when
      const result = shouldEnablePresetTools(override)

      //#then
      expect(result).toBe(false)
    })
  })

  describe("shouldEnableEvolutionTool", () => {
    test("defaults to false when enabled is undefined", () => {
      //#given
      const enabled = undefined

      //#when
      const result = shouldEnableEvolutionTool(enabled)

      //#then
      expect(result).toBe(false)
    })

    test("registers when explicitly enabled", () => {
      //#given
      const enabled = true

      //#when
      const result = shouldEnableEvolutionTool(enabled)

      //#then
      expect(result).toBe(true)
    })

    test("skips when explicitly disabled", () => {
      //#given
      const enabled = false

      //#when
      const result = shouldEnableEvolutionTool(enabled)

      //#then
      expect(result).toBe(false)
    })
  })
})
