import { describe, expect, test } from "bun:test";
import { buildSubagentTitle } from "../../features/background-agent/handle-index";
import { buildContinuationTitle, buildTaskTitle, resolveTaskDescription } from "./task-title";

describe("task-title fallback", () => {
  //#given missing description
  //#when resolving
  //#then never undefined/empty
  test("undefined description falls back", () => {
    const d = resolveTaskDescription({ description: undefined, prompt: "Fix the recorder bug now", category: "blue-pill" });
    expect(d).not.toBe("");
    expect(d.toLowerCase()).not.toContain("undefined");
  });
  test("literal 'undefined' string falls back", () => {
    expect(resolveTaskDescription({ description: "undefined", prompt: "" })).toBe("Background task");
  });
  test("buildTaskTitle never contains undefined", () => {
    expect(buildTaskTitle(undefined, "trinity").toLowerCase()).not.toContain("undefined");
    expect(buildSubagentTitle(undefined, "trinity").toLowerCase()).not.toContain("undefined");
  });
  test("continuation title falls back", () => {
    expect(buildContinuationTitle(undefined)).toBe("Continue: Background task");
  });
});
