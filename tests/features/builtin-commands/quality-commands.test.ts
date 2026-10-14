import { describe, expect, test } from "bun:test"
import { BuiltinCommandNameSchema } from "../../../src/config/schema/commands"
import { loadBuiltinCommands } from "../../../src/features/builtin-commands"
import { QUALITY_ASSURANCE_TEMPLATE } from "../../../src/features/builtin-commands/templates/quality-assurance"
import { QUALITY_AUDIT_TEMPLATE } from "../../../src/features/builtin-commands/templates/quality-audit"

describe("quality-audit template", () => {
  test("should export a non-empty template string", () => {
    //#given the quality-audit template
    //#when we access the template
    //#then it should be a non-empty string
    expect(typeof QUALITY_AUDIT_TEMPLATE).toBe("string")
    expect(QUALITY_AUDIT_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should default to project scope so a bare invocation resolves", () => {
    //#given the target-less default is self-contradictory when module is the default
    //#when we read the scope default
    //#then the default scope is project (target-optional), not module
    expect(QUALITY_AUDIT_TEMPLATE).toContain("(default: project)")
    expect(QUALITY_AUDIT_TEMPLATE).not.toContain("(default: module)")
  })

  test("should state that module scope requires a target", () => {
    //#given module scope is 'the directory containing --target'
    //#when we read the target requirement
    //#then module scope is named as target-requiring
    expect(QUALITY_AUDIT_TEMPLATE).toContain("file and module scope")
  })

  test("should name module-without-target in the resolve-or-stop failure list", () => {
    //#given the Step-1 guard stops on unresolvable scope
    //#when we read the failure enumeration
    //#then module scope without a target is an explicit failure case
    expect(QUALITY_AUDIT_TEMPLATE).toContain("file or module scope")
    expect(QUALITY_AUDIT_TEMPLATE).toContain("without a target")
  })
})

describe("quality-assurance template", () => {
  test("should export a non-empty template string", () => {
    //#given the quality-assurance template
    //#when we access the template
    //#then it should be a non-empty string
    expect(typeof QUALITY_ASSURANCE_TEMPLATE).toBe("string")
    expect(QUALITY_ASSURANCE_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should default to project scope to match the audit contract", () => {
    //#given the audit defaults to project
    //#when we read the assurance scope default
    //#then assurance also defaults to project (no target-less module dead end)
    expect(QUALITY_ASSURANCE_TEMPLATE).toContain("--scope=project")
    expect(QUALITY_ASSURANCE_TEMPLATE).toContain("(default: project)")
    expect(QUALITY_ASSURANCE_TEMPLATE).not.toContain("(default: module)")
  })

  test("should state that module scope requires a target", () => {
    //#given assurance mirrors the audit scoping rules
    //#when we read the module scope note
    //#then it is marked as target-requiring
    expect(QUALITY_ASSURANCE_TEMPLATE).toContain("requires --target")
  })
})

describe("quality command registration", () => {
  test("should register both commands in loadBuiltinCommands", () => {
    //#given the builtin command registry
    //#when we load all builtin commands
    //#then both quality commands are present
    const names = Object.keys(loadBuiltinCommands())
    expect(names).toContain("quality-audit")
    expect(names).toContain("quality-assurance")
  })

  test("should accept both commands in the config disabled_commands enum", () => {
    //#given the config-level BuiltinCommandNameSchema enum
    //#when we validate the quality command names
    //#then they are accepted (so they can be listed in disabled_commands)
    expect(BuiltinCommandNameSchema.safeParse("quality-audit").success).toBe(true)
    expect(BuiltinCommandNameSchema.safeParse("quality-assurance").success).toBe(true)
  })
})
