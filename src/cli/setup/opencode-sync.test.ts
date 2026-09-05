import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasContextModePlugin } from "./opencode-sync";

describe("hasContextModePlugin", () => {
  test("detects variants", () => {
    expect(hasContextModePlugin(["context-mode"])).toBe(true);
    expect(hasContextModePlugin(["@tarquinen/context-mode"])).toBe(true);
    expect(hasContextModePlugin(["opencode-context-mode"])).toBe(true);
    expect(hasContextModePlugin(["other"])).toBe(false);
  });
});

describe("syncOpencodePlugins idempotency", () => {
  test("dryRun does not write", async () => {
    const { syncOpencodePlugins } = await import("./opencode-sync");
    const dir = mkdtempSync(join(tmpdir(), "opencode-test-"));
    process.env.XDG_CONFIG_HOME = dir;
    await syncOpencodePlugins({ taskSystem: true, headroom: { enabled: false }, rtk: { enabled: false }, dcp: { enabled: false }, contextMode: true }, { dryRun: true });
    const cfgDir = join(dir, "opencode");
    expect(existsSync(join(cfgDir, "opencode.jsonc"))).toBe(false);
    expect(existsSync(join(cfgDir, "opencode.json"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
    delete process.env.XDG_CONFIG_HOME;
  });
});

describe("opencode-sync file handling", () => {
  test("preserve existing json vs jsonc handling via path detection", async () => {
    const { resolveOpencodeConfigPath } = await import("./opencode-sync");
    const r = resolveOpencodeConfigPath();
    expect(["json", "jsonc", "none"]).toContain(r.format);
    expect(r.path).toContain("opencode");
  });

  test("dedupes context-mode variants", async () => {
    const dir = mkdtempSync(join(tmpdir(), "opencode-dedupe-"));
    const cfgDir = join(dir, "opencode");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(cfgDir, { recursive: true });
    writeFileSync(join(cfgDir, "opencode.jsonc"), JSON.stringify({ plugin: ["opencode-matrixx", "@tarquinen/context-mode", "context-mode"] }));
    process.env.XDG_CONFIG_HOME = dir;
    const { syncOpencodePlugins } = await import("./opencode-sync");
    await syncOpencodePlugins({ taskSystem: true, headroom: { enabled: false }, rtk: { enabled: false }, dcp: { enabled: false }, contextMode: true }, { dryRun: false });
    const txt = readFileSync(join(cfgDir, "opencode.jsonc"), "utf-8");
    const parsed = JSON.parse(txt);
    expect(parsed.plugin.filter((p: string) => p === "context-mode").length).toBe(1);
    expect(parsed.plugin.includes("@tarquinen/context-mode")).toBe(false);
    await syncOpencodePlugins({ taskSystem: true, headroom: { enabled: false }, rtk: { enabled: false }, dcp: { enabled: false }, contextMode: true }, { dryRun: false });
    const txt2 = readFileSync(join(cfgDir, "opencode.jsonc"), "utf-8");
    const parsed2 = JSON.parse(txt2);
    expect(parsed2.plugin.filter((p: string) => p === "context-mode").length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
    delete process.env.XDG_CONFIG_HOME;
  });
});
