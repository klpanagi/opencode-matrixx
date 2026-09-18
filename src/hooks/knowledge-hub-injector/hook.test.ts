import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { createKnowledgeHubInjectorHook } from "./hook";

const INDEX_MARKER = "ROUTER-INDEX-CONTENT-abc123";
const CORPUS_MARKER = "CORPUS-SECRET-CONTENT-xyz789";
const PINNED_MARKER = "PINNED-FILE-CONTENT-qrs456";

const tmpRoots: string[] = [];
afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeCtx(): PluginInput {
  return { directory: tmpdir(), client: {} } as unknown as PluginInput;
}

function makeHub(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "kb-hub-"));
  tmpRoots.push(root);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

function readOutput(title: string, output = ""): { title: string; output: string; metadata: unknown } {
  return { title, output, metadata: {} };
}

describe("createKnowledgeHubInjectorHook", () => {
  test("injects hub index content on read", async () => {
    //#given
    const root = makeHub({ "_index.md": `# Hub\n\n${INDEX_MARKER}\n`, "notes.md": CORPUS_MARKER });
    const hook = createKnowledgeHubInjectorHook(makeCtx(), { hubs: [{ name: "kb", path: root, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }] });
    const output = readOutput(path.join(root, "notes.md"), "original");
    //#when
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, output);
    //#then
    expect(output.output).toContain(INDEX_MARKER);
    expect(output.output).toContain("original");
  });

  test("injects index once across two calls in the same session", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER });
    const hook = createKnowledgeHubInjectorHook(makeCtx(), { hubs: [{ name: "kb", path: root, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }] });
    const first = readOutput("a.md", "");
    const second = readOutput("b.md", "");
    //#when
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, first);
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c2" }, second);
    //#then
    expect(first.output).toContain(INDEX_MARKER);
    expect(second.output).not.toContain(INDEX_MARKER);
  });

  test("never injects corpus file content", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER, "deep-dive.md": CORPUS_MARKER });
    const hook = createKnowledgeHubInjectorHook(makeCtx(), { hubs: [{ name: "kb", path: root, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }] });
    const output = readOutput(path.join(root, "deep-dive.md"), CORPUS_MARKER);
    //#when
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, output);
    //#then
    expect(output.output).toContain(INDEX_MARKER);
    expect(output.output.split(CORPUS_MARKER).length - 1).toBe(1);
  });

  test("skips missing index without throwing", async () => {
    //#given
    const missing = path.join(tmpdir(), "kb-does-not-exist-12345");
    const hook = createKnowledgeHubInjectorHook(makeCtx(), { hubs: [{ name: "ghost", path: missing, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }] });
    const output = readOutput("a.md", "untouched");
    //#when
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, output);
    //#then
    expect(output.output).toBe("untouched");
  });

  test("pinned mode injects only explicitly listed files", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER, "pinned.md": PINNED_MARKER, "other.md": CORPUS_MARKER });
    const hook = createKnowledgeHubInjectorHook(makeCtx(), {
      hubs: [{ name: "kb", path: root, index: "_index.md", scope: "global", mode: "pinned", exclude: [] }],
      pinnedFiles: ["pinned.md"],
    });
    const output = readOutput("a.md", "");
    //#when
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, output);
    //#then
    expect(output.output).toContain(INDEX_MARKER);
    expect(output.output).toContain(PINNED_MARKER);
    expect(output.output).not.toContain(CORPUS_MARKER);
  });

  test("re-injects after session cleanup event", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER });
    const hook = createKnowledgeHubInjectorHook(makeCtx(), { hubs: [{ name: "kb", path: root, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }] });
    const first = readOutput("a.md", "");
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c1" }, first);
    //#when
    await hook.event({ event: { type: "session.deleted", properties: { info: { id: "ses-1" } } } });
    const second = readOutput("b.md", "");
    await hook["tool.execute.after"]({ tool: "read", sessionID: "ses-1", callID: "c2" }, second);
    //#then
    expect(second.output).toContain(INDEX_MARKER);
  });
});
