import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { LoadedHub } from "../../features/knowledge-hub/loader";
import { createKnowledgeHubGuardHook } from "./hook";

const tmpRoots: string[] = [];
afterEach(() => {
  while (tmpRoots.length > 0) {
    const dir = tmpRoots.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeCtx(directory: string): PluginInput {
  return { directory, client: {} } as unknown as PluginInput;
}

function makeHubRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "kb-guard-"));
  tmpRoots.push(root);
  return root;
}

function makeHub(root: string, exclude: string[] = []): LoadedHub {
  return {
    name: "kb",
    root,
    indexPath: path.join(root, "_index.md"),
    scope: "global",
    mode: "router-only",
    exclude,
  };
}

function writeArgs(filePath: string): { args: Record<string, unknown> } {
  return { args: { filePath } };
}

describe("createKnowledgeHubGuardHook", () => {
  test("blocks writes inside the hub root", async () => {
    //#given a hub and a write targeting a file inside it
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    //#when the guard runs before the write
    const blocked = hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-1", callID: "c1" },
      writeArgs(target),
    );
    //#then it throws naming the hub and the read-only rule
    await expect(blocked).rejects.toThrow('knowledge hub "kb"');
  });

  test("allows writes outside all hubs", async () => {
    //#given a hub and a write targeting an unrelated path
    const root = makeHubRoot();
    const outside = mkdtempSync(path.join(tmpdir(), "kb-outside-"));
    tmpRoots.push(outside);
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    //#when the guard runs before the write
    await hook["tool.execute.before"](
      { tool: "edit", sessionID: "ses-1", callID: "c1" },
      writeArgs(path.join(outside, "notes.md")),
    );
    //#then it resolves without throwing
  });

  test("allows writes to excluded paths inside the hub", async () => {
    //#given a hub whose exclude list covers scratch files
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), {
      hubs: [makeHub(root, ["scratch/**"])],
    });
    //#when the guard runs before a write to an excluded path
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-1", callID: "c1" },
      writeArgs(path.join(root, "scratch", "draft.md")),
    );
    //#then it resolves without throwing
  });

  test("fails open when hub config is unavailable", async () => {
    //#given a guard whose loader throws (missing config)
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), {
      getHubs: () => {
        throw new Error("no config");
      },
    });
    //#when the guard runs twice (warn-once path)
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-1", callID: "c1" },
      writeArgs("/any/path/notes.md"),
    );
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-1", callID: "c2" },
      writeArgs("/any/path/other.md"),
    );
    //#then both writes are allowed
  });

  test("blocks destructive bash targeting hub paths, allows reads", async () => {
    //#given a hub and bash commands touching it
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    //#when rm targets the hub file
    const blocked = hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses-1", callID: "c1" },
      { args: { command: `rm ${target}` } },
    );
    //#then it throws
    await expect(blocked).rejects.toThrow('knowledge hub "kb"');
    //#when cat reads the same file
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses-1", callID: "c2" },
      { args: { command: `cat ${target}` } },
    );
    //#then the read is allowed
  });
});
