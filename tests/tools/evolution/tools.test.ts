/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import type { ToolContext } from "@opencode-ai/plugin/tool";
import { createEvolutionTool } from "../../../src/tools/evolution/tools";

function makeCtx(directory: string): PluginInput {
  return { directory, client: {} } as unknown as PluginInput;
}

function makeToolContext(directory: string): ToolContext {
  return { sessionID: "ses-evolution", directory } as unknown as ToolContext;
}

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "evolution-tool-"));
  mkdirSync(path.join(dir, ".matrixx", "evolution", "pending"), { recursive: true });
  return dir;
}

function stagePending(dir: string, slug: string): void {
  writeFileSync(path.join(dir, ".matrixx", "evolution", "pending", `${slug}.md`), `# ${slug}\n\nBody.\n`);
  writeFileSync(
    path.join(dir, ".matrixx", "evolution", "pending", `${slug}.meta.json`),
    JSON.stringify({
      name: slug,
      version: "1.0.0",
      derived_from: ["ses-1"],
      created_at: new Date().toISOString(),
      confidence: 0.8,
      eval_score: null,
    }),
  );
}

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

describe("createEvolutionTool", () => {
  test("list reports empty when no proposals are pending", async () => {
    //#given the evolution tool rooted at a fresh project
    const dir = makeProject();
    const record = createEvolutionTool(makeCtx(dir));
    //#when listing pending proposals
    const result = await record.evolution.execute({ action: "list" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the receipt reports none pending
    expect(result).toContain("No pending evolution proposals");
  });

  test("list shows staged slugs with version and confidence", async () => {
    //#given a staged pending proposal
    const dir = makeProject();
    stagePending(dir, "my-skill");
    const record = createEvolutionTool(makeCtx(dir));
    //#when listing pending proposals
    const result = await record.evolution.execute({ action: "list" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the slug, version, and confidence are shown
    expect(result).toContain("my-skill");
    expect(result).toContain("1.0.0");
    expect(result).toContain("0.8");
  });

  test("get returns staged content and meta", async () => {
    //#given a staged pending proposal
    const dir = makeProject();
    stagePending(dir, "my-skill");
    const record = createEvolutionTool(makeCtx(dir));
    //#when getting the proposal
    const result = await record.evolution.execute({ action: "get", slug: "my-skill" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the content and meta are returned
    expect(result).toContain("# my-skill");
    expect(result).toContain("1.0.0");
  });

  test("get errors when the slug is not pending", async () => {
    //#given the evolution tool with nothing staged
    const dir = makeProject();
    const record = createEvolutionTool(makeCtx(dir));
    //#when getting an unknown slug
    const result = await record.evolution.execute({ action: "get", slug: "ghost" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then a not-found error names the slug
    expect(result).toContain("Error");
    expect(result).toContain("ghost");
  });

  test("approve transitions pending to approved plus audit", async () => {
    //#given a staged pending proposal
    const dir = makeProject();
    stagePending(dir, "my-skill");
    const record = createEvolutionTool(makeCtx(dir));
    //#when approving the slug (cwd scoped so the audit lands in the project)
    const result = await withCwd(dir, () =>
      record.evolution.execute({ action: "approve", slug: "my-skill" }, makeToolContext(dir)).then((__r) => __r.content),
    );
    //#then the skill is promoted, pending is removed, and the audit records it
    expect(result).toContain("Promoted my-skill");
    expect(readFileSync(path.join(dir, ".opencode", "skills", "my-skill", "SKILL.md"), "utf-8")).toContain(
      "# my-skill",
    );
    expect(() => readFileSync(path.join(dir, ".matrixx", "evolution", "pending", "my-skill.md"))).toThrow();
    const audit = readFileSync(path.join(dir, ".matrixx", "evolution", "audit.log"), "utf-8");
    expect(audit).toContain("promoted");
    expect(audit).toContain("my-skill");
  });

  test("approve errors when the slug is not pending", async () => {
    //#given the evolution tool with nothing staged
    const dir = makeProject();
    const record = createEvolutionTool(makeCtx(dir));
    //#when approving an unknown slug
    const result = await record.evolution.execute({ action: "approve", slug: "ghost" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then a not-found error points at list
    expect(result).toContain("Error");
    expect(result).toContain("ghost");
  });

  test("reject discards the pending proposal", async () => {
    //#given a staged pending proposal
    const dir = makeProject();
    stagePending(dir, "my-skill");
    const record = createEvolutionTool(makeCtx(dir));
    //#when rejecting the slug (cwd scoped so the audit lands in the project)
    const result = await withCwd(dir, () =>
      record.evolution.execute({ action: "reject", slug: "my-skill" }, makeToolContext(dir)).then((__r) => __r.content),
    );
    //#then pending is removed and the receipt confirms
    expect(result).toContain("Rejected my-skill");
    expect(() => readFileSync(path.join(dir, ".matrixx", "evolution", "pending", "my-skill.md"))).toThrow();
  });

  test("status reports state, pending count, and audit tail", async () => {
    //#given a project with state, one pending proposal, and audit entries
    const dir = makeProject();
    stagePending(dir, "my-skill");
    writeFileSync(
      path.join(dir, ".matrixx", "evolution", "audit.log"),
      `${JSON.stringify({ action: "staged", slug: "my-skill" })}\n`,
    );
    const record = createEvolutionTool(makeCtx(dir));
    //#when requesting status
    const result = await record.evolution.execute({ action: "status" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then state, pending count, and the audit tail are shown
    expect(result).toContain("Pending proposals (1)");
    expect(result).toContain("my-skill");
    expect(result).toContain("staged");
  });

  test("search and get_context return empty receipts on an empty store", async () => {
    //#given the evolution tool rooted at a fresh project
    const dir = makeProject();
    const record = createEvolutionTool(makeCtx(dir));
    //#when invoking the retrieval actions with nothing approved
    const search = await record.evolution.execute({ action: "search" }, makeToolContext(dir)).then((__r) => __r.content);
    const context = await record.evolution.execute({ action: "get_context" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then both report no retrievable knowledge without throwing
    expect(search).toContain("No retrievable");
    expect(context).toContain("No retrievable");
  });

  test("rejects path-traversal slugs", async () => {
    //#given the evolution tool
    const dir = makeProject();
    const record = createEvolutionTool(makeCtx(dir));
    //#when a slug escapes the pending dir
    const result = await record.evolution.execute({ action: "get", slug: "../evil" }, makeToolContext(dir)).then((__r) => __r.content);
    //#then the slug is rejected without filesystem access
    expect(result).toContain("Error");
    expect(result).toContain("../evil");
  });
});
