#!/usr/bin/env bash
# Local CI runner — mirrors .github/workflows/ci.yml exactly
set -euo pipefail

CI_STEPS=0
CI_FAILED=0

step() {
  CI_STEPS=$((CI_STEPS + 1))
  echo "::group::[$CI_STEPS] $*"
}

pass() {
  echo "✅ $*"
  echo "::endgroup::"
}

fail() {
  echo "❌ $*"
  CI_FAILED=$((CI_FAILED + 1))
  echo "::endgroup::"
}

export BUN_INSTALL_ALLOW_SCRIPTS="@ast-grep/napi"

# ------------------------------------------------------------------
# Install dependencies (shared across all CI jobs)
# ------------------------------------------------------------------
step "Install dependencies"
bun install && pass "Install dependencies" || fail "Install dependencies"

# ------------------------------------------------------------------
# Type check  (mirrors ci.yml typecheck job)
# ------------------------------------------------------------------
step "Type check"
bun run typecheck && pass "Type check" || fail "Type check"

# ------------------------------------------------------------------
# Lint  (mirrors ci.yml lint job)
# ------------------------------------------------------------------
step "Lint"
bun run lint && pass "Lint" || fail "Lint"

# ------------------------------------------------------------------
# Mock-heavy tests (isolated)  (mirrors ci.yml test job)
# ------------------------------------------------------------------
step "Mock-heavy tests (isolated) — plugin-handlers"
bun test tests/plugin-handlers && pass "plugin-handlers" || fail "plugin-handlers"

step "Mock-heavy tests (isolated) — compaction-context-injector"
bun test tests/hooks/compaction-context-injector && pass "compaction-context-injector" || fail "compaction-context-injector"

step "Mock-heavy tests (isolated) — tmux-subagent"
bun test tests/features/tmux-subagent && pass "tmux-subagent" || fail "tmux-subagent"

step "Mock-heavy tests (isolated) — individual files"
for test in \
  tests/tools/delegate-agent/sync-executor.test.ts \
  tests/tools/delegate-agent/session-creator.test.ts \
  tests/features/opencode-skill-loader/loader.test.ts \
  tests/features/opencode-skill-loader/agents-skills-global.test.ts \
  tests/tools/session-manager/storage.test.ts \
  tests/hooks/oracle-md-only/index.test.ts \
  tests/hooks/architect/index.test.ts \
  tests/hooks/matrix-loop/index.test.ts \
  tests/hooks/start-work/index.test.ts \
  tests/hooks/auto-update-checker/hook/background-update-check.test.ts \
  tests/hooks/auto-update-checker/hook.test.ts \
  tests/features/skill-mcp-manager/manager.test.ts \
  tests/features/background-agent/manager.test.ts \
  tests/hooks/comment-checker/cli.test.ts \
  tests/hooks/comment-checker/hook.apply-patch.test.ts \
  tests/hooks/directory-agents-injector/injector.test.ts \
  tests/hooks/directory-readme-injector/injector.test.ts \
  tests/hooks/rules-injector/injector.test.ts \
  tests/hooks/compaction-todo-preserver/index.test.ts \
  tests/hooks/preemptive-compaction.test.ts \
  tests/tools/lsp/client.test.ts \
  tests/tools/lsp/lsp-process.test.ts \
  tests/tools/skill/tools.test.ts \
  tests/hooks/anthropic-context-window-limit-recovery/empty-content-recovery-sdk.test.ts \
  tests/hooks/anthropic-context-window-limit-recovery/recovery-hook.test.ts \
  tests/hooks/anthropic-context-window-limit-recovery/storage.test.ts \
  tests/agents/utils.test.ts \
  tests/hooks/task-notepad/hook.test.ts \
  tests/tools/bdd-parse-gherkin/tools.test.ts
do
  label="$(basename "$(dirname "$test")")/$(basename "$test")"
  bun test "$test" && pass "$label" || fail "$label"
done

# ------------------------------------------------------------------
# Remaining tests  (mirrors ci.yml remaining-tests step)
# ------------------------------------------------------------------
step "Remaining tests"
find tests script -name '*.test.ts' -type f \
  | grep -v -F \
    -e 'tests/plugin-handlers/' \
    -e 'tests/hooks/compaction-context-injector/' \
    -e 'tests/features/tmux-subagent/' \
    -e 'tests/tools/delegate-agent/sync-executor.test.ts' \
    -e 'tests/tools/delegate-agent/session-creator.test.ts' \
    -e 'tests/features/opencode-skill-loader/loader.test.ts' \
    -e 'tests/features/opencode-skill-loader/agents-skills-global.test.ts' \
    -e 'tests/tools/session-manager/storage.test.ts' \
    -e 'tests/hooks/oracle-md-only/index.test.ts' \
    -e 'tests/hooks/architect/index.test.ts' \
    -e 'tests/hooks/matrix-loop/index.test.ts' \
    -e 'tests/hooks/start-work/index.test.ts' \
    -e 'tests/hooks/auto-update-checker/hook/background-update-check.test.ts' \
    -e 'tests/hooks/auto-update-checker/hook.test.ts' \
    -e 'tests/features/skill-mcp-manager/manager.test.ts' \
    -e 'tests/features/background-agent/manager.test.ts' \
    -e 'tests/hooks/comment-checker/cli.test.ts' \
    -e 'tests/hooks/comment-checker/hook.apply-patch.test.ts' \
    -e 'tests/hooks/directory-agents-injector/injector.test.ts' \
    -e 'tests/hooks/directory-readme-injector/injector.test.ts' \
    -e 'tests/hooks/rules-injector/injector.test.ts' \
    -e 'tests/hooks/compaction-todo-preserver/index.test.ts' \
    -e 'tests/hooks/preemptive-compaction.test.ts' \
    -e 'tests/tools/lsp/client.test.ts' \
    -e 'tests/tools/lsp/lsp-process.test.ts' \
    -e 'tests/tools/skill/tools.test.ts' \
    -e 'tests/hooks/anthropic-context-window-limit-recovery/empty-content-recovery-sdk.test.ts' \
    -e 'tests/hooks/anthropic-context-window-limit-recovery/recovery-hook.test.ts' \
    -e 'tests/hooks/anthropic-context-window-limit-recovery/storage.test.ts' \
    -e 'tests/agents/utils.test.ts' \
    -e 'tests/hooks/task-notepad/hook.test.ts' \
    -e 'tests/tools/bdd-parse-gherkin/tools.test.ts' \
  | xargs bun test && pass "Remaining tests" || fail "Remaining tests"

# ------------------------------------------------------------------
# Build + verify output  (mirrors ci.yml build job)
# ------------------------------------------------------------------
step "Build"
bun run build && pass "Build" || fail "Build"

step "Verify build output"
if test -f dist/index.js && test -f dist/index.d.ts; then
  pass "Build output verified (dist/index.js + dist/index.d.ts)"
else
  fail "Build output missing"
fi

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "========== CI SUMMARY =========="
echo "Steps: $CI_STEPS, Passed: $((CI_STEPS - CI_FAILED)), Failed: $CI_FAILED"

if [ "$CI_FAILED" -gt 0 ]; then
  exit 1
fi
