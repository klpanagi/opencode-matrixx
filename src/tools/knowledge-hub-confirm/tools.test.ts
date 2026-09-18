import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { isHubWriteApproved } from "../../hooks/knowledge-hub-guard/approvals";
import { createKnowledgeHubConfirmTool } from "./tools";

function makeCtx(directory: string): PluginInput {
  return { directory, client: {} } as unknown as PluginInput;
}

function makeToolContext(sessionID: string, directory: string): ToolContext {
  return { sessionID, directory } as unknown as ToolContext;
}

describe("createKnowledgeHubConfirmTool", () => {
  test("records approval for an absolute path", async () => {
    //#given the confirm tool and an absolute hub path
    const dir = mkdtempSync(path.join(tmpdir(), "kb-confirm-"));
    const confirm = createKnowledgeHubConfirmTool(makeCtx(dir));
    const target = path.join(dir, "notes.md");
    //#when the tool executes with the current session
    const receipt = await confirm.execute({ path: target }, makeToolContext("ses-abs", dir));
    //#then the receipt names the path and the approval is recorded
    expect(receipt).toContain(target);
    expect(receipt).toContain("ses-abs");
    expect(isHubWriteApproved("ses-abs", target)).toBe(true);
  });

  test("resolves relative paths against ctx.directory", async () => {
    //#given the confirm tool rooted at a project dir
    const dir = mkdtempSync(path.join(tmpdir(), "kb-confirm-"));
    const confirm = createKnowledgeHubConfirmTool(makeCtx(dir));
    //#when the tool executes with a relative path
    const receipt = await confirm.execute({ path: "notes.md" }, makeToolContext("ses-rel", dir));
    //#then the approval covers the resolved absolute path
    const resolved = path.resolve(dir, "notes.md");
    expect(receipt).toContain(resolved);
    expect(isHubWriteApproved("ses-rel", resolved)).toBe(true);
  });

  test("explicit sessionID overrides the current session", async () => {
    //#given the confirm tool and an explicit session arg
    const dir = mkdtempSync(path.join(tmpdir(), "kb-confirm-"));
    const confirm = createKnowledgeHubConfirmTool(makeCtx(dir));
    const target = path.join(dir, "notes.md");
    //#when the tool executes with a sessionID arg
    await confirm.execute({ path: target, sessionID: "ses-explicit" }, makeToolContext("ses-current", dir));
    //#then the approval lands on the explicit session only
    expect(isHubWriteApproved("ses-explicit", target)).toBe(true);
    expect(isHubWriteApproved("ses-current", target)).toBe(false);
  });
});
