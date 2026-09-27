#!/usr/bin/env bun
/**
 * End-to-end verification for the `task-notepad-writer` hook.
 *
 * WHY THIS EXISTS
 * The unit fence (`tests/hooks/task-notepad-writer/hook.test.ts`) calls
 * `createTaskNotepadWriterHook` directly. It therefore still passes if the hook
 * is never dispatched — a hook can be exported, registered in the tool-guard
 * tier, and gated, yet never fire. That exact class of defect was found in
 * review, which is why the dispatch line in `src/plugin/tool-execute-after.ts`
 * is a Definition-of-Done line.
 *
 * This script closes that gap. It:
 *   1. boots the REAL plugin from the BUILT `dist/index.js` (what OpenCode loads)
 *   2. drives the REAL `task_create` / `task_update` tools for genuine output
 *   3. pushes that output through the plugin's real `tool.execute.after` chain
 *   4. inspects the real files on disk
 *
 * It proves plan-bucket routing, adhoc fallback, the completion stamp, and
 * idempotency across repeated invocations.
 *
 * USAGE
 *   bun run build          # dist/index.js must be current
 *   bun script/verify-notepad-e2e.ts
 *
 * Exit code 0 = every check passed. Nothing is written outside a temp dir.
 *
 * NOTE ON OUTPUT
 * Logging is synchronous (appendFileSync) and the process exits explicitly.
 * Several hooks install timers, so the event loop stays alive after the work is
 * done; without both, output is lost to a block-buffered pipe on kill.
 */

import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const LOG = join(tmpdir(), "tnw-e2e.log");
writeFileSync(LOG, "");
const log = (...parts: unknown[]) => {
  appendFileSync(LOG, `${parts.join(" ")}\n`);
};

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const root = mkdtempSync(join(tmpdir(), "tnw-e2e-"));
const plansDir = join(root, ".matrixx", "plans");
const notepadsDir = join(root, ".matrixx", "notepads");
await Bun.$`mkdir -p ${plansDir} ${notepadsDir}`.quiet();

const PLAN = "e2e-demo";
writeFileSync(join(plansDir, `${PLAN}.md`), "# Plan: e2e-demo\n\n- [ ] task one\n");

/**
 * `output` is an OBJECT `{ title, output, metadata }`; the tool's returned
 * string lives in `output.output`. Passing a bare string silently no-ops every
 * hook in the chain — the first draft of this script did exactly that.
 */
const fire = async (
  after: (i: unknown, o: unknown) => Promise<unknown>,
  tool: string,
  toolOutput: string,
) => {
  const call = after(
    { tool, sessionID: "ses_e2e", callID: `c-${tool}-${counter++}` },
    { title: `${tool} result`, output: toolOutput, metadata: {} },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve("__TIMEOUT__"), 30_000);
  });
  const settled = await Promise.race([call, guard]);
  if (settled === "__TIMEOUT__") {
    log(`  (tool.execute.after chain did not settle within 30s for ${tool})`);
  }
  try {
    await call;
  } catch (error) {
    log(`  (hook chain threw: ${error instanceof Error ? error.message : error})`);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
let counter = 0;

const listNotepads = (bucket?: string) => {
  if (!existsSync(notepadsDir)) return [] as string[];
  const buckets = bucket ? [bucket] : readdirSync(notepadsDir);
  return buckets.flatMap((b) =>
    readdirSync(join(notepadsDir, b)).map((f) => `.matrixx/notepads/${b}/${f}`),
  );
};

// ------------------------------------------------------------------ 1. boot
log("### 1. booting MatrixxPlugin from dist/index.js");
const distPath = "/home/klpanagi/matrixx/dist/index.js";
if (!existsSync(distPath)) {
  log(`  FAIL  dist/index.js missing — run \`bun run build\` first`);
  process.exit(1);
}
const mod = (await import(distPath)) as {
  default: (i: unknown) => Promise<Record<string, unknown>>;
};
const hooks = await mod.default({
  client: {
    app: { log: () => {} },
    session: { todo: async () => ({ todos: [] }) },
    config: { get: async () => ({}) },
  },
  project: { id: "e2e", worktree: root },
  directory: root,
  worktree: root,
  serverUrl: "http://127.0.0.1:1",
  $: Bun.$,
});
const after = hooks["tool.execute.after"] as
  | ((i: unknown, o: unknown) => Promise<unknown>)
  | undefined;
check("plugin booted from the built artifact", true);
check("plugin exposes a tool.execute.after handler", typeof after === "function");
if (typeof after !== "function") process.exit(1);

// ------------------------------------------------- 2. real task tool output
const { createTaskCreateTool } = await import(
  "/home/klpanagi/matrixx/src/tools/task/task-create.ts"
);
const { createTaskUpdateTool } = await import(
  "/home/klpanagi/matrixx/src/tools/task/task-update.ts"
);
const toolCtx = { sessionID: "ses_e2e", directory: root, worktree: root };
type ExecutableTool = { execute: (args: unknown, context: unknown) => Promise<string> };
const createTool = createTaskCreateTool({}, toolCtx as never) as ExecutableTool;
const updateTool = createTaskUpdateTool({}, toolCtx as never) as ExecutableTool;

const call = (tool: ExecutableTool, args: unknown) => tool.execute(args, toolCtx);

// --------------------------------------------------- 3. plan-bucket create
log("\n### 2. real task_create with metadata.planName -> plan bucket");
const created = await call(createTool, {
  items: [
    {
      subject: "Rotate the signing key",
      description: "rotate it",
      activeForm: "Rotating",
      metadata: { planName: PLAN },
      priority: "high",
    },
  ],
});
log(`  tool output: ${created}`);
const createdJson = JSON.parse(created) as { tasks?: { id: string }[]; error?: string };
check("task_create returned a task", Boolean(createdJson.tasks?.[0]), createdJson.error);
await fire(after, "task_create", created);
const afterCreate = listNotepads();
log(`  notepads: ${JSON.stringify(afterCreate)}`);
check("exactly one notepad written", afterCreate.length === 1, `got ${afterCreate.length}`);
check("routed to the plan bucket", afterCreate[0] === `.matrixx/notepads/${PLAN}/0-rotate-the-signing-key.md`, afterCreate[0]);
check("no adhoc bucket created", !existsSync(join(notepadsDir, "adhoc")));

// ---------------------------------------------------- 4. adhoc fallback
log("\n### 3. real task_create with no planName -> adhoc bucket");
const adhoc = await call(createTool, {
  items: [{ subject: "Loose end no plan", description: "x", activeForm: "Doing" }],
});
await fire(after, "task_create", adhoc);
const afterAdhoc = listNotepads();
log(`  notepads: ${JSON.stringify(afterAdhoc)}`);
check("adhoc bucket created", existsSync(join(notepadsDir, "adhoc")));
check("still exactly two notepads", afterAdhoc.length === 2, `got ${afterAdhoc.length}`);

// --------------------------------------------------- 5. completion stamp
const taskId = createdJson.tasks?.[0]?.id ?? "";
log(`\n### 4. real task_update (${taskId} -> completed)`);
const updated = await call(updateTool, { id: taskId, status: "completed" });
log(`  tool output: ${updated}`);
await fire(after, "task_update", updated);

const planBucket = join(notepadsDir, PLAN);
const planFile = existsSync(planBucket) ? readdirSync(planBucket)[0] : undefined;
check("plan-bucket file still present", Boolean(planFile));
if (planFile) {
  const body = readFileSync(join(planBucket, planFile), "utf8");
  log(`\n--- FULL CONTENTS of .matrixx/notepads/${PLAN}/${planFile} ---`);
  for (const line of body.split("\n")) log(line);
  log("--- end contents ---");
  check("scaffold has the Task ID marker", body.includes("**Task ID**"));
  check("scaffold has a Started field", body.includes("**Started**"));
  check("completion stamp appended", body.includes("## Completion"));
  check("stamp carries completed_at", body.includes("completed_at"));

  // ------------------------------------------------------ 6. idempotency
  log("\n### 5. replay both calls (idempotency)");
  await fire(after, "task_create", created);
  await fire(after, "task_update", updated);
  const files = readdirSync(planBucket);
  const replayed = readFileSync(join(planBucket, files[0]), "utf8");
  log(`  plan bucket now holds: ${JSON.stringify(files)}`);
  check("no duplicate file created", files.length === 1, `got ${files.length}`);
  check("file byte-identical after replay", replayed === body);
  check(
    "exactly one Completion stamp",
    (replayed.match(/## Completion/g) ?? []).length === 1,
    `got ${(replayed.match(/## Completion/g) ?? []).length}`,
  );
}

log(`\ntemp root: ${root}`);
log(`full log  : ${LOG}`);
log(failures === 0 ? "\nRESULT: all checks passed" : `\nRESULT: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
