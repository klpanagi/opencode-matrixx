import { describe, expect, mock, test } from "bun:test"
import type { MatrixxConfig } from "../../config"
import { createRtkBashRewriterHook } from "./hook"

function streamFromString(str: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(str)); c.close() } })
}
function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start(c) { c.close() } })
}
function spawnMock(exitCode: number, stdout: string) {
  return mock(() => ({ exited: Promise.resolve(exitCode), stdout: streamFromString(stdout), stderr: emptyStream() })) as any
}
describe("createRtkBashRewriterHook", () => {
  test("returns passthrough hook when config.rtk.enabled is false", () => {
    //#given
    const hook = createRtkBashRewriterHook({} as any, { rtk: { enabled: false } } as MatrixxConfig)
    //#then
    expect(hook).toBeDefined()
    expect(hook["tool.execute.before"]).toBeDefined()
  })
  test("logs warning when rtk binary not found", () => {
    //#given
    const originalWhich = Bun.which; Bun.which = (() => null) as any
    const config = { rtk: { enabled: true } } as MatrixxConfig
    //#when
    const hook = createRtkBashRewriterHook({} as any, config)
    //#then
    expect(hook).toBeDefined()
    Bun.which = originalWhich
  })
  test("passes through when rtk binary not found", async () => {
    //#given
    const originalWhich = Bun.which; Bun.which = (() => null) as any
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git status")
    Bun.which = originalWhich
  })
  test("rewrites command when rtk returns exit code 0", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(0, "rtk git status")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("rtk git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through when rtk returns exit code 1", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(1, "")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "echo hello" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("echo hello")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through when rtk returns exit code 2 (deny)", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(2, "")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "rm -rf /" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("rm -rf /")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("rewrites command when rtk returns exit code 3 (rewrite available)", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(3, "rtk git push")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git push" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("rtk git push")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through on subprocess timeout", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(3, "")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git push" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git push")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through on subprocess timeout", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any
    Bun.spawn = mock(() => ({ exited: Promise.reject(new Error("timeout")), stdout: emptyStream(), stderr: emptyStream() })) as any
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through on subprocess spawn error", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any
    Bun.spawn = mock(() => { throw new Error("spawn failed") }) as any
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("does not intercept interactive-bash tool", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(0, "rtk git status")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "interactive-bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("does not intercept non-bash tools", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(0, "rtk git status")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "write", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("passes through when command is empty", async () => {
    //#given
    const originalWhich = Bun.which; Bun.which = (() => "/usr/bin/rtk") as any
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("")
    Bun.which = originalWhich
  })
  test("passes through when rewritten command equals original", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(0, "echo hello")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "echo hello" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("echo hello")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
  test("end-to-end with nonInteractiveEnv", async () => {
    //#given
    const originalWhich = Bun.which; const originalSpawn = Bun.spawn
    Bun.which = (() => "/usr/bin/rtk") as any; Bun.spawn = spawnMock(0, "rtk git status")
    const config = { rtk: { enabled: true } } as MatrixxConfig
    const hook = createRtkBashRewriterHook({} as any, config)
    const input = { tool: "bash", sessionID: "test", callID: "1" }
    const output = { args: { command: "git status" } }
    //#when
    await hook["tool.execute.before"](input, output)
    //#then
    expect(output.args.command).toBe("rtk git status")
    Bun.which = originalWhich; Bun.spawn = originalSpawn
  })
})
