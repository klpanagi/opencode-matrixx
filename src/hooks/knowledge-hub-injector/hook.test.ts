import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { ContextCollector } from "../../features/context-injector";
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

function userMessages(sessionID: string): {
  messages: Array<{
    info: { id: string; role: string; sessionID: string };
    parts: Array<{ type: string; text: string; id: string; messageID: string; sessionID: string }>;
  }>;
} {
  return {
    messages: [
      {
        info: { id: "msg-1", role: "user", sessionID },
        parts: [{ type: "text", text: "hello", id: "prt-1", messageID: "msg-1", sessionID }],
      },
    ],
  };
}

function makeHook(
  root: string,
  extra: { mode?: "router-only" | "pinned"; pinnedFiles?: string[]; hubs?: unknown[] } = {},
): { hook: ReturnType<typeof createKnowledgeHubInjectorHook>; collector: ContextCollector } {
  const collector = new ContextCollector();
  const hook = createKnowledgeHubInjectorHook(makeCtx(), {
    hubs: (extra.hubs as never) ?? [
      {
        name: "kb",
        path: root,
        index: "_index.md",
        scope: "global",
        mode: extra.mode ?? "router-only",
        exclude: [],
      },
    ],
    pinnedFiles: extra.pinnedFiles,
    collector,
  });
  return { hook, collector };
}

async function runTransform(
  hook: ReturnType<typeof createKnowledgeHubInjectorHook>,
  sessionID: string,
): Promise<void> {
  const transform = hook["experimental.chat.messages.transform"];
  await transform({}, userMessages(sessionID) as unknown as Parameters<typeof transform>[1]);
}

describe("createKnowledgeHubInjectorHook", () => {
  test("first transform registers router with directive", async () => {
    //#given
    const root = makeHub({ "_index.md": `# Hub\n\n${INDEX_MARKER}\n`, "notes.md": CORPUS_MARKER });
    const { hook, collector } = makeHook(root);
    //#when
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.hasPending("ses-1")).toBe(true);
    const pending = collector.consume("ses-1");
    expect(pending.hasContent).toBe(true);
    expect(pending.merged).toContain(INDEX_MARKER);
    expect(pending.merged).toContain("websearch");
    expect(pending.merged).toContain("@hub/path");
    expect(pending.merged).toContain('<knowledge-hub name="kb">');
  });

  test("second transform in same session does not re-register", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER });
    const { hook, collector } = makeHook(root);
    await runTransform(hook, "ses-1");
    collector.consume("ses-1");
    //#when
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.hasPending("ses-1")).toBe(false);
  });

  test("never registers corpus file content", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER, "deep-dive.md": CORPUS_MARKER });
    const { hook, collector } = makeHook(root);
    //#when
    await runTransform(hook, "ses-1");
    //#then
    const pending = collector.consume("ses-1");
    expect(pending.merged).toContain(INDEX_MARKER);
    expect(pending.merged).not.toContain(CORPUS_MARKER);
  });

  test("empty hubs register nothing", async () => {
    //#given
    const { hook, collector } = makeHook(tmpdir(), { hubs: [] });
    //#when
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.hasPending("ses-1")).toBe(false);
  });

  test("skips missing index without throwing", async () => {
    //#given
    const missing = path.join(tmpdir(), "kb-does-not-exist-12345");
    const collector = new ContextCollector();
    const hook = createKnowledgeHubInjectorHook(makeCtx(), {
      hubs: [{ name: "ghost", path: missing, index: "_index.md", scope: "global", mode: "router-only", exclude: [] }],
      collector,
    });
    //#when
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.hasPending("ses-1")).toBe(false);
  });

  test("pinned mode registers only explicitly listed files", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER, "pinned.md": PINNED_MARKER, "other.md": CORPUS_MARKER });
    const { hook, collector } = makeHook(root, { mode: "pinned", pinnedFiles: ["pinned.md"] });
    //#when
    await runTransform(hook, "ses-1");
    //#then
    const pending = collector.consume("ses-1");
    expect(pending.merged).toContain(INDEX_MARKER);
    expect(pending.merged).toContain(PINNED_MARKER);
    expect(pending.merged).not.toContain(CORPUS_MARKER);
  });

  test("re-registers after compaction", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER });
    const { hook, collector } = makeHook(root);
    await runTransform(hook, "ses-1");
    collector.consume("ses-1");
    //#when
    await hook.event({ event: { type: "session.compacted", properties: { sessionID: "ses-1" } } });
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.hasPending("ses-1")).toBe(true);
    expect(collector.consume("ses-1").merged).toContain(INDEX_MARKER);
  });

  test("re-registers after session deleted", async () => {
    //#given
    const root = makeHub({ "_index.md": INDEX_MARKER });
    const { hook, collector } = makeHook(root);
    await runTransform(hook, "ses-1");
    collector.consume("ses-1");
    //#when
    await hook.event({ event: { type: "session.deleted", properties: { info: { id: "ses-1" } } } });
    await runTransform(hook, "ses-1");
    //#then
    expect(collector.consume("ses-1").merged).toContain(INDEX_MARKER);
  });
});
