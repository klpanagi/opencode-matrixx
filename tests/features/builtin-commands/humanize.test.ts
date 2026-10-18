import { describe, expect, test } from "bun:test"
import { loadBuiltinCommands } from "../../../src/features/builtin-commands/commands"
import { HUMANIZE_TEMPLATE } from "../../../src/features/builtin-commands/templates/humanize"
import type { BuiltinCommandName } from "../../../src/features/builtin-commands/types"

describe("HUMANIZE_TEMPLATE", () => {
  test("should export a non-empty template string", () => {
    //#given the humanize template
    //#when we access the template
    //#then it should be a non-empty string
    expect(typeof HUMANIZE_TEMPLATE).toBe("string")
    expect(HUMANIZE_TEMPLATE.length).toBeGreaterThan(0)
  })

  test("should document the CLI shape", () => {
    //#given the humanize template
    //#when we read the usage block
    //#then it documents the command, modes, and dry-run flag
    expect(HUMANIZE_TEMPLATE).toContain("/humanize")
    expect(HUMANIZE_TEMPLATE).toContain("--mode=text|comments|code|all")
    expect(HUMANIZE_TEMPLATE).toContain("--dry-run")
  })

  test("should implement all five phases", () => {
    //#given the humanize template
    //#when we read the phased workflow
    //#then all five phases are present
    expect(HUMANIZE_TEMPLATE).toContain("PHASE 0")
    expect(HUMANIZE_TEMPLATE).toContain("PHASE 1")
    expect(HUMANIZE_TEMPLATE).toContain("PHASE 2")
    expect(HUMANIZE_TEMPLATE).toContain("PHASE 3")
    expect(HUMANIZE_TEMPLATE).toContain("PHASE 4")
  })

  test("should include all 7 slop categories", () => {
    //#given the humanize template
    //#when we read the detection categories
    //#then all 7 category headings are present
    expect(HUMANIZE_TEMPLATE).toContain("Category 1: Verbose Comments")
    expect(HUMANIZE_TEMPLATE).toContain("Category 2: Redundant Error Handling")
    expect(HUMANIZE_TEMPLATE).toContain("Category 3: Over-Engineered Patterns")
    expect(HUMANIZE_TEMPLATE).toContain("Category 4: Generic AI Phrasing")
    expect(HUMANIZE_TEMPLATE).toContain("Category 5: Cargo-Cult Boilerplate")
    expect(HUMANIZE_TEMPLATE).toContain("Category 6: Padding/Verbosity")
    expect(HUMANIZE_TEMPLATE).toContain("Category 7: Weird Codegen Artifacts")
  })

  test("should include prose-quality rules", () => {
    //#given the humanize template
    //#when we read the text-mode rules
    //#then prose-quality rules are documented
    expect(HUMANIZE_TEMPLATE).toContain("clarity")
    expect(HUMANIZE_TEMPLATE).toContain("concision")
    expect(HUMANIZE_TEMPLATE).toContain("natural voice")
    expect(HUMANIZE_TEMPLATE).toContain("structure")
  })

  test("should state the NO-detector-evasion exclusion and never-auto-apply rule", () => {
    //#given the humanize template is quality-focused only
    //#when we read the guardrails
    //#then the exclusion and approval gate are stated
    expect(HUMANIZE_TEMPLATE).toContain("NO-detector-evasion")
    expect(HUMANIZE_TEMPLATE).toContain("NEVER auto-apply")
  })
})

describe("loadBuiltinCommands - humanize", () => {
  test("should include humanize command in loaded commands", () => {
    //#given no disabled commands
    const disabledCommands: BuiltinCommandName[] = []

    //#when we load all builtin commands
    const commands = loadBuiltinCommands(disabledCommands)

    //#then humanize is present
    expect(commands.humanize).toBeDefined()
    expect(commands.humanize.name).toBe("humanize")
  })

  test("should exclude humanize when disabled", () => {
    //#given humanize is disabled
    const disabledCommands: BuiltinCommandName[] = ["humanize"]

    //#when we load builtin commands
    const commands = loadBuiltinCommands(disabledCommands)

    //#then humanize is omitted while others remain
    expect(commands.humanize).toBeUndefined()
    expect(commands.handoff).toBeDefined()
  })

  test("should include humanize template content with wrapper and $ARGUMENTS", () => {
    //#given no disabled commands
    //#when we load builtin commands
    const commands = loadBuiltinCommands()

    //#then the template wraps HUMANIZE_TEMPLATE with $ARGUMENTS
    expect(commands.humanize.template).toContain(HUMANIZE_TEMPLATE)
    expect(commands.humanize.template).toContain("<command-instruction>")
    expect(commands.humanize.template).toContain("$ARGUMENTS")
  })

  test("should accept humanize in the BuiltinCommandName union", () => {
    //#given the BuiltinCommandName union
    //#when we assign humanize to it
    //#then it compiles (type-level check)
    const n: BuiltinCommandName = "humanize"
    expect(n).toBe("humanize")
  })
})
