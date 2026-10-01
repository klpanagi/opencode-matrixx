// Side-effect-free entry point for bench/sandbox use (issue #158).
//
// Why this file exists: `src/index.ts` is the OpenCode plugin entry. It must
// not export functions (OpenCode treats every export as a plugin instance),
// and its built bundle (`dist/index.js`, ~4 MB ESM) cannot be `require()`d
// from a plain sandbox subprocess (ERR_REQUIRE_ESM + unresolvable externals
// like `@ast-grep/napi` at eval time). Importing tool factories through the
// plugin bundle is therefore the wrong path and aborts silently.
//
// This module re-exports ONLY pure tool factories. No plugin closure, no
// `startTmuxCheck`, no `injectServerAuthIntoClient`, no config loading, no
// manager/hook construction at module scope. Safe to `await import()` from
// `ctx_execute` (language: javascript) or a `bun` bench script:
//
//   const { createPlanCreateTool } = await import("dist/tools.js");
//   const tool = createPlanCreateTool(undefined);
//
// Build: `bun run build:tools` → `dist/tools.js` (see package.json).
export { createPlanCreateTool } from "./tools/plan/plan-create"
export { createPlanDeleteTool } from "./tools/plan/plan-delete"
export { createPlanListTool } from "./tools/plan/plan-list"
export { createPlanReadTool } from "./tools/plan/plan-read"
export { createPlanTasksTool } from "./tools/plan/plan-tasks"
export { createPlanUpdateTool } from "./tools/plan/plan-update"
