/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { CONTEXT_TRUNCATION_MARKER, resolveProjectIdentity } from "../../../src/features/evolution/store";
import { EVOLUTION_QUERY_ACTIONS, GET_CONTEXT_CHAR_CAP } from "../../../src/tools/evolution/constants";
import { createEvolutionTool } from "../../../src/tools/evolution/tools";

function makeCtx(directory: string): PluginInput {
  return { directory, client: {} } as unknown as PluginInput;
}

function makeToolContext(directory: string): ToolContext {
  return { sessionID: "ses-evolution", directory } as unknown as ToolContext;
}

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "evolution-retrieval-"));
  mkdirSync(path.join(dir, ".matrixx", "evolution", "pending"), { recursive: true });
  return dir;
}

function seedSkill(dir: string, slug: string, meta: Record<string, unknown>, body: string): void {
  const skillDir = path.join(dir, ".matrixx", "evolution", "skills", slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "meta.json"), JSON.stringify(meta));
  writeFileSync(path.join(skillDir, "SKILL.md"), body);
}

function snapshotTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      out.push(full);
      if (entry.isDirectory()) walk(full);
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

describe("T9 retrieval query actions", () => {
  test("scoped kind search returns the approved head only", async () => {
    //#given a seeded mix of head v2, superseded v1, quarantined q1, other-project p1, and unscoped u1
    const dir = makeProject();
    const pid = resolveProjectIdentity(dir).projectId;
    seedSkill(dir, "head-v2", { status: "approved", kind: "gotcha", projectId: pid }, "# head v2\n");
    seedSkill(dir, "superseded-v1", { status: "approved", kind: "gotcha", projectId: pid, superseded_by: "head-v2" }, "# v1\n");
    seedSkill(dir, "q1", { status: "quarantined", kind: "gotcha", projectId: pid }, "# q1\n");
    seedSkill(dir, "p1", { status: "approved", kind: "gotcha", projectId: "proj-other" }, "# p1\n");
    seedSkill(dir, "u1", { status: "approved", kind: "gotcha" }, "# u1\n");
    const record = createEvolutionTool(makeCtx(dir));
    //#when searching for gotchas in this project's scope
    const result = await record.evolution.execute({ action: "search", kind: "gotcha" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then only the head surfaces — superseded, quarantined, cross-project, and unscoped are excluded
    expect(result).toContain("head-v2");
    expect(result).not.toContain("superseded-v1");
    expect(result).not.toContain("q1");
    expect(result).not.toContain("p1");
    expect(result).not.toContain("u1");
  });

  test("get_context truncates oversized bodies at the char cap with a marker", async () => {
    //#given an approved record whose body exceeds the cap
    const dir = makeProject();
    const pid = resolveProjectIdentity(dir).projectId;
    const huge = "x".repeat(GET_CONTEXT_CHAR_CAP + 500);
    seedSkill(dir, "huge-skill", { status: "approved", kind: "gotcha", projectId: pid }, huge);
    const record = createEvolutionTool(makeCtx(dir));
    //#when requesting context
    const result = await record.evolution.execute({ action: "get_context", kind: "gotcha" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the marker is present and the raw oversized body was cut
    expect(result).toContain(CONTEXT_TRUNCATION_MARKER);
    expect(result.length).toBeLessThan(huge.length);
  });

  test("query action manifest exposes no mutate actions", () => {
    //#given the allowlisted query actions
    //#when scanning for mutation verbs
    const mutateLike = EVOLUTION_QUERY_ACTIONS.filter((action) =>
      /create|write|delete|stage|promote|supersede|quarantine|mutate|rm\b/i.test(action),
    );
    //#then the retrieval surface is exactly read-only
    expect(EVOLUTION_QUERY_ACTIONS).toEqual(["search", "get_context"]);
    expect(mutateLike).toEqual([]);
  });

  test("search and get_context never mutate the evolution store", async () => {
    //#given a seeded approved record and a baseline filesystem snapshot
    const dir = makeProject();
    const pid = resolveProjectIdentity(dir).projectId;
    seedSkill(dir, "head-v2", { status: "approved", kind: "gotcha", projectId: pid }, "# head v2\n");
    const before = snapshotTree(path.join(dir, ".matrixx", "evolution"));
    const record = createEvolutionTool(makeCtx(dir));
    //#when running both query actions
    await record.evolution.execute({ action: "search", kind: "gotcha" }, makeToolContext(dir)).then((__r) => __r.content);
    await record.evolution.execute({ action: "get_context", kind: "gotcha" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the store tree is byte-for-byte the same (no writes, no audit)
    expect(snapshotTree(path.join(dir, ".matrixx", "evolution"))).toEqual(before);
  });
});
