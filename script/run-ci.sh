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
# Mock-heavy tests (isolated) — single source: script/mock-heavy-list.txt
# Each entry runs in its own process to avoid mock.module() pollution.
# Single source — do not duplicate; add new mock-heavy entries to script/mock-heavy-list.txt only.
# Verify via: bash script/run-ci.sh or act pull_request -j test-v2
# ------------------------------------------------------------------
step "Mock-heavy tests (isolated)"
while IFS= read -r test || [ -n "$test" ]; do
  [ -z "$test" ] && continue
  label="$(basename "$(dirname "$test")")/$(basename "$test")"
  # For directory entries, use the directory path as label
  if [[ "$test" == */ ]]; then
    label="${test%/}"
  fi
  bun test "$test" && pass "$label" || fail "$label"
done < script/mock-heavy-list.txt
# ------------------------------------------------------------------
# Remaining tests  (mirrors ci.yml remaining-tests step)
# Excludes mock-heavy entries via single source: script/mock-heavy-list.txt
# ------------------------------------------------------------------
step "Remaining tests"
find tests script -name '*.test.ts' -type f \
  | grep -v -F -f script/mock-heavy-list.txt \
  | xargs bun test && pass "Remaining tests" || fail "Remaining tests"

# ---------------------------------------------------------------------------
# V1 compat (advisory)  (mirrors ci.yml test-v1-compat job)
# Mirrors the non-blocking `test-v1-compat` job: continue-on-error in CI, so it
# is advisory here too and must NEVER increment CI_FAILED. Sunset: one cycle
# after cutover merges to `dev`. Mirrors the job list exactly — edit both.
# ---------------------------------------------------------------------------
step "V1 compat (advisory, non-blocking)"
bun test tests/plugin/dual-entry.test.ts tests/config/hooks-v1-keys.test.ts \
  tests/cli/runtime/compat.test.ts tests/hooks/document-reader-guard-v1-wiring.test.ts \
  tests/shared/permission-compat.test.ts && pass "V1 compat (advisory)" \
  || echo "⚠️  V1 compat (advisory) — FAILED but non-blocking by design (one-cycle sunset)"

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
