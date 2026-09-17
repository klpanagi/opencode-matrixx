import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearInjectedPaths } from "../../../src/hooks/directory-agents-injector/storage";
import { clearInjectedRules } from "../../../src/hooks/rules-injector/storage";
import { buildDirectoryContextBlock } from "../../../src/hooks/post-read-injector/block";
import { MAX_DIRECTORY_CONTEXT_BYTES } from "../../../src/hooks/post-read-injector/constants";
import { createUnifiedPostReadProcessor } from "../../../src/hooks/post-read-injector/injector";
import { collectAncestorDirs } from "../../../src/hooks/post-read-injector/unified-walk";

const sessions: string[] = [];
function newSession(): string {
  const id = `post-read-test-${Date.now()}-${randomUUID()}`;
  sessions.push(id);
  return id;
}

afterEach(() => {
  while (sessions.length > 0) {
    const id = sessions.pop() as string;
    try { clearInjectedPaths(id); } catch {}
    try { clearInjectedRules(id); } catch {}
  }
});

function passthroughTruncator() {
  return {
    truncate: async (_sessionID: string, content: string) => ({ result: content, truncated: false }),
  };
}

function makeProject(withBigAgents = false): { root: string; file: string } {
  const root = mkdtempSync(join(tmpdir(), "post-read-unified-"));
  mkdirSync(join(root, ".git"), { recursive: true });
  mkdirSync(join(root, "a", "b"), { recursive: true });
  mkdirSync(join(root, ".matrixx", "rules"), { recursive: true });
  const agentsContent = withBigAgents ? "x".repeat(10000) : "# A agents";
  writeFileSync(join(root, "a", "AGENTS.md"), agentsContent);
  writeFileSync(join(root, "a", "b", "AGENTS.md"), "# B agents");
  writeFileSync(join(root, ".matrixx", "rules", "r.md"), "---\nalwaysApply: true\n---\nrule body here\n");
  const file = join(root, "a", "b", "file.txt");
  writeFileSync(file, "hello\n");
  return { root, file };
}

describe("post-read-injector cap", () => {
  it("caps total directory context at 6144 bytes", () => {
    //#given cap constant
    //#when read
    //#then 6144
    expect(MAX_DIRECTORY_CONTEXT_BYTES).toBe(6144);
  });

  it("emits one block without marker when under cap", () => {
    //#given small sections
    //#when block built
    const block = buildDirectoryContextBlock(["aaa", "bbb"]);
    //#then single header, no silent marker
    expect(block.includes("[Directory Context]")).toBe(true);
    expect(block.includes("truncated")).toBe(false);
    expect(block.length).toBeLessThanOrEqual(MAX_DIRECTORY_CONTEXT_BYTES);
  });

  it("caps oversized sections with truncation marker and no silent drop", () => {
    //#given oversized sections
    const sections = ["y".repeat(3000), "z".repeat(3000), "w".repeat(3000)];
    //#when block built
    const block = buildDirectoryContextBlock(sections);
    //#then capped with explicit marker
    expect(block.length).toBeLessThanOrEqual(MAX_DIRECTORY_CONTEXT_BYTES);
    expect(block.includes("truncated")).toBe(true);
  });
});

describe("collectAncestorDirs single walk", () => {
  it("visits each ancestor exactly once in one upward walk", () => {
    //#given nested path
    const visited: string[] = [];
    //#when single walk
    const dirs = collectAncestorDirs("/repo/a/b/c/file.ts", "/repo", "/repo", (d) => visited.push(d));
    //#then each ancestor once, leaf-first, shared walk
    expect(dirs.length).toBeGreaterThan(0);
    expect(new Set(dirs).size).toBe(dirs.length);
    expect(visited).toEqual(dirs);
    expect(dirs[0]).toBe("/repo/a/b/c");
  });
});

describe("createUnifiedPostReadProcessor", () => {
  it("injects agents and rules in one walk with a single capped block", async () => {
    //#given project with agents files and a rule
    const { root, file } = makeProject();
    try {
      const sessionID = newSession();
      const visited: string[] = [];
      const processor = createUnifiedPostReadProcessor({
        workspaceDirectory: root,
        truncator: passthroughTruncator(),
        onVisitDir: (d) => visited.push(d),
      });
      const output = { title: file, output: "", metadata: {} };
      //#when first read of new dir
      await processor.processFilePathForInjection(file, sessionID, output);
      //#then single walk, single block, under cap
      expect(new Set(visited).size).toBe(visited.length);
      const occurrences = output.output.split("\n\n[Directory Context]\n").length - 1;
      expect(occurrences).toBe(1);
      const blockStart = output.output.indexOf("\n\n[Directory Context]");
      expect(blockStart).toBeGreaterThanOrEqual(0);
      expect(output.output.length - blockStart).toBeLessThanOrEqual(MAX_DIRECTORY_CONTEXT_BYTES);
      expect(output.output).toContain("[Directory Context: ");
      expect(output.output).toContain("[Rule: ");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("dedups second read of same dir in same session", async () => {
    //#given injected session
    const { root, file } = makeProject();
    try {
      const sessionID = newSession();
      const processor = createUnifiedPostReadProcessor({
        workspaceDirectory: root,
        truncator: passthroughTruncator(),
      });
      const first = { title: file, output: "", metadata: {} };
      await processor.processFilePathForInjection(file, sessionID, first);
      expect(first.output.includes("[Directory Context]")).toBe(true);
      //#when same dir read again
      const second = { title: file, output: "", metadata: {} };
      await processor.processFilePathForInjection(file, sessionID, second);
      //#then no duplicate injection
      expect(second.output).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips walk when output already carries a directory block", async () => {
    //#given output with existing block (second thin wrapper in same tick)
    const { root, file } = makeProject();
    try {
      const sessionID = newSession();
      let walks = 0;
      const processor = createUnifiedPostReadProcessor({
        workspaceDirectory: root,
        truncator: passthroughTruncator(),
        onVisitDir: () => { walks += 1; },
      });
      const output = { title: file, output: "prior\n\n[Directory Context]\nold", metadata: {} };
      //#when second wrapper sees same output object
      await processor.processFilePathForInjection(file, sessionID, output);
      //#then no additional walk, output untouched
      expect(walks).toBe(0);
      expect(output.output).toBe("prior\n\n[Directory Context]\nold");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("caps oversized directory content at 6144 bytes with marker", async () => {
    //#given oversized agents file
    const { root, file } = makeProject(true);
    try {
      const sessionID = newSession();
      const processor = createUnifiedPostReadProcessor({
        workspaceDirectory: root,
        truncator: passthroughTruncator(),
      });
      const output = { title: file, output: "", metadata: {} };
      //#when injected
      await processor.processFilePathForInjection(file, sessionID, output);
      //#then single block capped with marker, no silent drop
      const blockStart = output.output.indexOf("\n\n[Directory Context]");
      expect(blockStart).toBeGreaterThanOrEqual(0);
      expect(output.output.length - blockStart).toBeLessThanOrEqual(MAX_DIRECTORY_CONTEXT_BYTES);
      expect(output.output.includes("truncated")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
