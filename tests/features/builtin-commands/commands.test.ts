import { describe, expect, test } from "bun:test"
import { loadBuiltinCommands } from "../../../src/features/builtin-commands/commands"
import { DCP_PROFILE_TEMPLATE } from "../../../src/features/builtin-commands/templates/dcp-profile"
import { END_ULTRAWORK_TEMPLATE } from "../../../src/features/builtin-commands/templates/end-ultrawork"
import { HANDOFF_TEMPLATE } from "../../../src/features/builtin-commands/templates/handoff"
import { REMOVE_DEADCODE_TEMPLATE } from "../../../src/features/builtin-commands/templates/remove-deadcode"
import type { BuiltinCommandName } from "../../../src/features/builtin-commands/types"

describe("loadBuiltinCommands", () => {
  test("should include handoff command in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = []

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands.handoff).toBeDefined()
    expect(commands.handoff.name).toBe("handoff")
  })

  test("should exclude handoff when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["handoff"]

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands.handoff).toBeUndefined()
  })

  test("should include handoff template content in command template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands.handoff.template).toContain(HANDOFF_TEMPLATE)
  })

  test("should include session context variables in handoff template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands.handoff.template).toContain("$SESSION_ID")
    expect(commands.handoff.template).toContain("$TIMESTAMP")
    expect(commands.handoff.template).toContain("$ARGUMENTS")
  })

  test("should have correct description for handoff", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands.handoff.description).toContain("context summary")
  })
})

describe("loadBuiltinCommands - remove-deadcode", () => {
  test("should include remove-deadcode command in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = []

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["remove-deadcode"]).toBeDefined()
    expect(commands["remove-deadcode"].name).toBe("remove-deadcode")
  })

  test("should exclude remove-deadcode when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["remove-deadcode"]

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["remove-deadcode"]).toBeUndefined()
  })

  test("should include remove-deadcode template content in command template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["remove-deadcode"].template).toContain(REMOVE_DEADCODE_TEMPLATE)
  })

  test("should include $ARGUMENTS in remove-deadcode template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["remove-deadcode"].template).toContain("$ARGUMENTS")
  })

  test("should have correct description for remove-deadcode", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["remove-deadcode"].description).toContain("dead code")
  })
})

describe("loadBuiltinCommands - end-ultrawork", () => {
  test("should include end-ultrawork command in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = []

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["end-ultrawork"]).toBeDefined()
    expect(commands["end-ultrawork"].name).toBe("end-ultrawork")
  })

  test("should exclude end-ultrawork when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["end-ultrawork"]

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["end-ultrawork"]).toBeUndefined()
  })

  test("should include end-ultrawork template content in command template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["end-ultrawork"].template).toContain(END_ULTRAWORK_TEMPLATE)
  })

  test("should include $ARGUMENTS in end-ultrawork template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["end-ultrawork"].template).toContain("$ARGUMENTS")
  })

  test("should have correct description for end-ultrawork", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["end-ultrawork"].description).toContain("ultrawork")
  })
})

describe("REMOVE_DEADCODE_TEMPLATE", () => {
  test("should include LSP-based symbol discovery instructions", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("LspDocumentSymbols")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("LspFindReferences")
  })

  test("should include phased approach", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("PHASE 1")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("PHASE 2")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("PHASE 3")
  })

  test("should include verification instructions", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("lsp_diagnostics")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("bun test")
  })

  test("should include safety rules against breaking exports", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("export")
  })

  test("should include dry-run support", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("dry-run")
  })

  test("should include confidence classification", () => {
    //#given - the template string

    //#when / #then
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("HIGH")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("MEDIUM")
    expect(REMOVE_DEADCODE_TEMPLATE).toContain("LOW")
  })

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    expect(emojiRegex.test(REMOVE_DEADCODE_TEMPLATE)).toBe(false)
  })
})

describe("HANDOFF_TEMPLATE", () => {
  test("should include session reading instruction", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("session_read")
  })

  test("should include compaction-style sections in output format", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("user_requests")
    expect(HANDOFF_TEMPLATE).toContain("explicit_constraints")
  })

  test("should include programmatic context gathering instructions", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("todoread")
    expect(HANDOFF_TEMPLATE).toContain("git diff")
    expect(HANDOFF_TEMPLATE).toContain("git status")
  })

  test("should include context extraction format", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("work_completed")
    expect(HANDOFF_TEMPLATE).toContain("current_state")
    expect(HANDOFF_TEMPLATE).toContain("pending_tasks")
    expect(HANDOFF_TEMPLATE).toContain("key_files")
    expect(HANDOFF_TEMPLATE).toContain("important_decisions")
    expect(HANDOFF_TEMPLATE).toContain("context_for_continuation")
    expect(HANDOFF_TEMPLATE).toContain("goal")
  })

  test("should enforce first person perspective", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("first person perspective")
  })

  test("should limit key files to 10", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("max 10")
  })

  test("should instruct plain text format without markdown", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("plain text with bullets")
    expect(HANDOFF_TEMPLATE).toContain("no markdown headers")
  })

  test("should include user instructions for new session", () => {
    //#given - the template string

    //#when / #then
    expect(HANDOFF_TEMPLATE).toContain("new session")
    expect(HANDOFF_TEMPLATE).toContain("opencode")
  })

  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    expect(emojiRegex.test(HANDOFF_TEMPLATE)).toBe(false)
  })

describe("loadBuiltinCommands - dcp-profile", () => {
  test("should include dcp-profile command in loaded commands", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = []

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["dcp-profile"]).toBeDefined()
    expect(commands["dcp-profile"].name).toBe("dcp-profile")
  })

  test("should exclude dcp-profile when disabled", () => {
    //#given
    const disabledCommands: BuiltinCommandName[] = ["dcp-profile"]

    //#when
    const commands = loadBuiltinCommands(disabledCommands)

    //#then
    expect(commands["dcp-profile"]).toBeUndefined()
  })

  test("should include dcp-profile template content in command template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["dcp-profile"].template).toContain(DCP_PROFILE_TEMPLATE)
  })

  test("should include $ARGUMENTS in dcp-profile template", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["dcp-profile"].template).toContain("$ARGUMENTS")
  })

  test("should have correct description for dcp-profile", () => {
    //#given - no disabled commands

    //#when
    const commands = loadBuiltinCommands()

    //#then
    expect(commands["dcp-profile"].description).toContain("DCP")
  })
})

describe("DCP_PROFILE_TEMPLATE", () => {
  test("should not contain emojis", () => {
    //#given - the template string

    //#when / #then
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    expect(emojiRegex.test(DCP_PROFILE_TEMPLATE)).toBe(false)
  })
})

})
