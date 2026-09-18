import { describe, expect, test } from "bun:test";
import type { PluginInput } from "@opencode-ai/plugin";
import type { LoadedHub } from "../../features/knowledge-hub/loader";
import { createKnowledgeHubSearchNudgeHook } from "./hook";

function makeCtx(): PluginInput {
  return { directory: "/tmp", client: {} } as unknown as PluginInput;
}

function makeHub(name: string): LoadedHub {
  return {
    name,
    root: `/hubs/${name}`,
    indexPath: `/hubs/${name}/_index.md`,
    scope: "global",
    mode: "router-only",
    exclude: [],
  };
}

function nudgeArgs(): { args: Record<string, unknown>; message?: string } {
  return { args: {} };
}

describe("createKnowledgeHubSearchNudgeHook", () => {
  test("nudges on websearch", async () => {
    //#given a hub and a websearch call
    const hook = createKnowledgeHubSearchNudgeHook(makeCtx(), { hubs: [makeHub("kb")] });
    const output = nudgeArgs();
    //#when the hook runs before websearch
    await hook["tool.execute.before"](
      { tool: "websearch", sessionID: "ses-1", callID: "c1" },
      output,
    );
    //#then output.message names the hub and the @hub/path convention
    expect(output.message).toContain('"kb"');
    expect(output.message).toContain("@hub/path");
    expect(output.message?.length ?? 0).toBeLessThan(300);
  });

  test("nudges on webfetch", async () => {
    //#given a hub and a webfetch call
    const hook = createKnowledgeHubSearchNudgeHook(makeCtx(), { hubs: [makeHub("kb")] });
    const output = nudgeArgs();
    //#when the hook runs before webfetch
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "ses-1", callID: "c1" },
      output,
    );
    //#then output.message is set
    expect(output.message).toContain('"kb"');
    expect(output.message?.length ?? 0).toBeLessThan(300);
  });

  test("silent on unrelated tools", async () => {
    //#given a hub and non-search tools
    const hook = createKnowledgeHubSearchNudgeHook(makeCtx(), { hubs: [makeHub("kb")] });
    //#when the hook runs before read and bash
    const readOutput = nudgeArgs();
    await hook["tool.execute.before"](
      { tool: "read", sessionID: "ses-1", callID: "c1" },
      readOutput,
    );
    const bashOutput = nudgeArgs();
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "ses-1", callID: "c2" },
      bashOutput,
    );
    //#then no message is set
    expect(readOutput.message).toBeUndefined();
    expect(bashOutput.message).toBeUndefined();
  });

  test("silent with empty hubs", async () => {
    //#given no hubs configured
    const hook = createKnowledgeHubSearchNudgeHook(makeCtx(), { hubs: [] });
    const output = nudgeArgs();
    //#when the hook runs before websearch
    await hook["tool.execute.before"](
      { tool: "websearch", sessionID: "ses-1", callID: "c1" },
      output,
    );
    //#then no message is set
    expect(output.message).toBeUndefined();
  });

  test("never throws when hub resolution fails", async () => {
    //#given a loader that throws
    const hook = createKnowledgeHubSearchNudgeHook(makeCtx(), {
      getHubs: () => {
        throw new Error("no config");
      },
    });
    const output = nudgeArgs();
    //#when the hook runs before websearch
    await hook["tool.execute.before"](
      { tool: "websearch", sessionID: "ses-1", callID: "c1" },
      output,
    );
    //#then it resolves without throwing and stays silent
    expect(output.message).toBeUndefined();
  });
});
