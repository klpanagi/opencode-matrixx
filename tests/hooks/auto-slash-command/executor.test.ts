import { describe, expect, it } from "bun:test"
//#given scope-narrowing: hook owns builtin/markdown/skill scopes only,
//#when plugin-scope (foreign) commands or empty templates resolve,
//#then executor declines and the user message is left for the owning plugin.
import { executeSlashCommand, isHookOwnedCommand } from "../../../src/hooks/auto-slash-command/executor"

describe("isHookOwnedCommand", () => {
  it("should NOT own plugin-scope commands even when they carry a template", () => {
    //#given a foreign plugin command with template content (e.g. /dcp-compress)
    //#when ownership is checked
    //#then the hook declines so the owning plugin handles it natively
    expect(isHookOwnedCommand({ scope: "plugin", content: "Trigger manual compression" })).toBe(false)
  })

  it("should NOT own plugin-scope commands without content", () => {
    //#given a code-registered foreign command with no template
    //#when ownership is checked
    //#then the hook declines instead of injecting an empty instruction block
    expect(isHookOwnedCommand({ scope: "plugin", content: undefined })).toBe(false)
  })

  it("should own builtin commands with a template", () => {
    //#given a matrixx builtin command
    //#when ownership is checked
    //#then the hook expands it as before
    expect(isHookOwnedCommand({ scope: "builtin", content: "<command-instruction>do work</command-instruction>" })).toBe(true)
  })

  it("should NOT own commands with empty content in any scope", () => {
    //#given owned scopes with blank templates
    //#when ownership is checked
    //#then the hook declines rather than rendering an empty instruction block
    expect(isHookOwnedCommand({ scope: "builtin", content: "   " })).toBe(false)
    expect(isHookOwnedCommand({ scope: "opencode-project", content: "" })).toBe(false)
    expect(isHookOwnedCommand({ scope: "skill", content: undefined })).toBe(false)
  })

  it("should own skill and markdown scopes with content", () => {
    //#given skill and markdown commands with bodies
    //#when ownership is checked
    //#then the hook expands them as before
    expect(isHookOwnedCommand({ scope: "skill", content: "skill instructions" })).toBe(true)
    expect(isHookOwnedCommand({ scope: "opencode-project", content: "project command body" })).toBe(true)
    expect(isHookOwnedCommand({ scope: "opencode", content: "global command body" })).toBe(true)
  })
})

describe("executeSlashCommand scope-narrowing", () => {
  it("should still expand owned builtin commands", async () => {
    //#given an owned builtin command
    //#when executed without a client
    //#then the template is returned as before (no regression)
    const result = await executeSlashCommand({ command: "task-list", args: "", raw: "/task-list" })
    expect(result.success).toBe(true)
    expect(result.replacementText).toContain("/task-list Command")
    expect(result.replacementText).toContain("## Command Instructions")
  })

  it("should decline foreign plugin commands so native routing proceeds", async () => {
    //#given a foreign command (e.g. /dcp-compress from the external DCP plugin)
    //#when executed without a client (no plugin visibility)
    //#then the hook reports not-found and leaves the message alone
    const result = await executeSlashCommand({ command: "dcp-compress", args: "", raw: "/dcp-compress" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("another plugin")
  })
})
