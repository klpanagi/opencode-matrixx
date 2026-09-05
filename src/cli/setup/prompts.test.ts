import { describe, expect, test } from "bun:test";
import { runSetupPrompts } from "./prompts";

describe("runSetupPrompts --yes", () => {
  test("returns defaults without prompts", async () => {
    const state = await runSetupPrompts([], { yes: true });
    expect(state.taskSystem).toBe(true);
    expect(state.headroom.enabled).toBe(false);
    expect(state.rtk.enabled).toBe(false);
    expect(state.dcp.enabled).toBe(false);
    expect(state.contextMode).toBe(false);
  });

  test("headroom decline defaults to disabled", async () => {
    const state = await runSetupPrompts([], { yes: true });
    expect(state.headroom.enabled).toBe(false);
    expect(state.headroom.proxyUrl).toBeUndefined();
  });
});

describe("prompts content", () => {
  test("prompts.ts contains required system prompts", async () => {
    const content = await Bun.file("src/cli/setup/prompts.ts").text();
    expect(content).toContain("task_system");
    expect(content).toContain("Headroom");
    expect(content).toContain("RTK");
    expect(content).toContain("DCP");
    expect(content).toContain("context-mode");
  });
});
