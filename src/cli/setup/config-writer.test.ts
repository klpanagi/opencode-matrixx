import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMatrixxConfig, previewDiff, resolveMatrixxConfigPath, writeMatrixxConfig } from "./config-writer";
import type { SetupState } from "./types";

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    taskSystem: true,
    headroom: { enabled: false },
    rtk: { enabled: false },
    dcp: { enabled: false },
    contextMode: false,
    ...overrides,
  };
}

describe("buildMatrixxConfig", () => {
  test("creates config from state", () => {
    const c = buildMatrixxConfig(makeState({ headroom: { enabled: true, proxyUrl: "http://127.0.0.1:8787" }, dcp: { enabled: true } }), null);
    expect((c.experimental as unknown as { task_system: boolean }).task_system).toBe(true);
    expect((c.headroom as unknown as { enabled: boolean }).enabled).toBe(true);
    expect((c.dcp as unknown as { enabled: boolean }).enabled).toBe(true);
  });

  test("preserves existing fields", () => {
    const existing = { disabled_hooks: ["comment-checker"] } as unknown as import("../../config/schema/matrixx-config").MatrixxConfig;
    const c = buildMatrixxConfig(makeState(), existing);
    expect((c as unknown as { disabled_hooks: string[] }).disabled_hooks).toContain("comment-checker");
  });
});

describe("previewDiff", () => {
  test("produces diff lines", () => {
    const d = previewDiff("a\nb", "a\nc");
    expect(d).toContain("- b");
    expect(d).toContain("+ c");
  });
});

describe("resolveMatrixxConfigPath", () => {
  test("returns format and path", () => {
    const r = resolveMatrixxConfigPath();
    expect(["json", "jsonc", "none"]).toContain(r.format);
    expect(r.path).toContain("matrixx");
  });
});

describe("writeMatrixxConfig", () => {
  test("new file creates and validates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "matrixx-test-"));
    const p = join(dir, "matrixx.jsonc");
    const c = buildMatrixxConfig(makeState(), null);
    await writeMatrixxConfig(p, c, { dryRun: false, backup: false });
    expect(existsSync(p)).toBe(true);
    const txt = readFileSync(p, "utf-8");
    expect(JSON.parse(txt)).toHaveProperty("experimental");
    rmSync(dir, { recursive: true, force: true });
  });

  test("merge preserves custom and creates backup", async () => {
    const dir = mkdtempSync(join(tmpdir(), "matrixx-test-"));
    const p = join(dir, "matrixx.jsonc");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(p, JSON.stringify({ disabled_hooks: ["comment-checker"], headroom: { enabled: false } }));
    const c = buildMatrixxConfig(makeState({ headroom: { enabled: true, proxyUrl: "http://127.0.0.1:8787" } }), null);
    await writeMatrixxConfig(p, c, { dryRun: false, backup: true });
    const txt = readFileSync(p, "utf-8");
    const parsed = JSON.parse(txt);
    expect(parsed.disabled_hooks).toContain("comment-checker");
    expect(parsed.headroom.enabled).toBe(true);
    const hasBak = existsSync(dir) && (await import("node:fs")).readdirSync(dir).some((f: string) => f.startsWith("matrixx.jsonc.bak."));
    expect(hasBak).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  test("dryRun writes nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "matrixx-test-"));
    const p = join(dir, "matrixx.jsonc");
    const c = buildMatrixxConfig(makeState(), null);
    await writeMatrixxConfig(p, c, { dryRun: true, backup: false });
    expect(existsSync(p)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
