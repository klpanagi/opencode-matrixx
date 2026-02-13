# Issues & Pre-existing Failures

## Pre-existing Test Failures (NOT caused by rename)

These failures exist on the `dev` branch before any rename changes:

1. **`src/shared/model-resolver.test.ts`** (25 failures) - Model resolution pipeline returns `anthropic/claude-opus-4-6` via `provider-fallback` instead of expected models. Tests expect the old resolution logic.
2. **`src/features/mcp-oauth/provider.test.ts`** (6 failures) - `TypeError: provider.tokens is not a function`. The `McpOAuthProvider` class interface has changed but tests weren't updated.
3. **`src/hooks/keyword-detector/index.test.ts`** (1 failure) - Expected `[search-mode]` prefix but received `<system-reminder>` format.
4. **`src/hooks/prometheus-md-only/index.test.ts`** (3 failures) - Expected `[SYSTEM DIRECTIVE: OH-MY-OPENCODE` but received `[DIRECTIVE:PROMETHEUS READ-ONLY]` format.
5. **`src/hooks/unstable-agent-babysitter/index.test.ts`** (3 failures) - `promptCalls.length` expected 1 but received 0.
6. **`src/tools/delegate-task/sync-session-poller.test.ts`** (1 timeout) - 5000ms timeout.
7. **`src/tools/delegate-task/tools.test.ts`** (3 timeouts) - 10000-20000ms timeouts.

**Decision**: These are pre-existing failures unrelated to the Matrix rename. Typecheck and build both pass cleanly. We proceed with the rename using `bun run typecheck` and `bun run build` as verification gates (not `bun test` which has pre-existing failures).
