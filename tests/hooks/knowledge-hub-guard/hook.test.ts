import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import type { LoadedHub } from "../../../src/features/knowledge-hub/loader";
import { createKnowledgeHubConfirmTool } from "../../../src/tools/knowledge-hub-confirm";
import { approveHubWrite, clearHubWriteApprovals } from "../../../src/hooks/knowledge-hub-guard/approvals";
import { createKnowledgeHubGuardHook } from "../../../src/hooks/knowledge-hub-guard/hook";

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

describe("hub write approvals", () => {
  test("approval allows the exact path", async () => {
    //#given a hub, a blocked target, and a recorded approval
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    approveHubWrite("ses-exact", target);
    //#when the guard runs before the write
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-exact", callID: "c1" },
      writeArgs(target),
    );
    //#then it resolves without throwing
  });

  test("parent-dir approval allows a child path", async () => {
    //#given an approval recorded for the hub root
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    approveHubWrite("ses-parent", root);
    //#when the guard runs before a write to a nested file
    await hook["tool.execute.before"](
      { tool: "edit", sessionID: "ses-parent", callID: "c1" },
      writeArgs(path.join(root, "sub", "notes.md")),
    );
    //#then it resolves without throwing
  });

  test("approval matches non-normalized equivalents", async () => {
    //#given an approval recorded with dot segments in the path
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    approveHubWrite("ses-norm", path.join(root, "sub", "..", "notes.md"));
    //#when the guard runs before a write to the normalized path
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-norm", callID: "c1" },
      writeArgs(path.join(root, "notes.md")),
    );
    //#then it resolves without throwing
  });

  test("expired approval still denies", async () => {
    //#given an approval whose TTL already elapsed
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    approveHubWrite("ses-expired", target, -1000);
    //#when the guard runs before the write
    const blocked = hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-expired", callID: "c1" },
      writeArgs(target),
    );
    //#then it throws naming the hub and the confirm flow
    await expect(blocked).rejects.toThrow('knowledge hub "kb"');
    await expect(blocked).rejects.toThrow("knowledge_hub_confirm");
  });

  test("approval from another session denies", async () => {
    //#given an approval recorded for a different session
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    approveHubWrite("ses-other", target);
    //#when the guard runs before a write in this session
    const blocked = hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-mine", callID: "c1" },
      writeArgs(target),
    );
    //#then it throws
    await expect(blocked).rejects.toThrow('knowledge hub "kb"');
  });

  test("deny message instructs the confirm flow", async () => {
    //#given a hub and a write with no approval
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    //#when the guard denies the write
    const blocked = hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-no-approval", callID: "c1" },
      writeArgs(target),
    );
    //#then the error names the hub, the path, and both confirm steps
    await expect(blocked).rejects.toThrow('knowledge hub "kb"');
    await expect(blocked).rejects.toThrow(target);
    await expect(blocked).rejects.toThrow("question tool");
    await expect(blocked).rejects.toThrow("knowledge_hub_confirm");
  });

  test("approval allows destructive bash targeting hub paths", async () => {
    //#given an approval covering the hub file
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    approveHubWrite("ses-bash", target);
    //#when bash removes the approved file
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses-bash", callID: "c1" },
      { args: { command: `rm ${target}` } },
    );
    //#then it resolves without throwing
  });

  test("confirm tool records approval end-to-end with guard", async () => {
    //#given a guard blocking a hub file and the confirm tool
    clearHubWriteApprovals();
    const root = makeHubRoot();
    const hook = createKnowledgeHubGuardHook(makeCtx(tmpdir()), { hubs: [makeHub(root)] });
    const target = path.join(root, "notes.md");
    const confirm = createKnowledgeHubConfirmTool(makeCtx(tmpdir()));
    const context = { sessionID: "ses-e2e", directory: tmpdir() } as unknown as ToolContext;
    //#when the user-approved path is confirmed
    const receipt = await confirm.execute({ path: target }, context);
    //#then the receipt names the path and the retry succeeds
    expect(receipt).toContain(target);
    expect(receipt).toContain("ses-e2e");
    await hook["tool.execute.before"](
      { tool: "write", sessionID: "ses-e2e", callID: "c1" },
      writeArgs(target),
    );
  });
});
