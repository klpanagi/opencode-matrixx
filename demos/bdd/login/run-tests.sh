#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FEATURE_DIR="$SCRIPT_DIR"
PREVIEW_PORT="${PREVIEW_PORT:-3000}"
PREVIEW_HOST="${PREVIEW_HOST:-127.0.0.1}"
PREVIEW_SERVER="$FEATURE_DIR/components/preview-server.ts"
PREVIEW_LOG="$FEATURE_DIR/.preview-server.log"
export BDD_BASE_URL="${BDD_BASE_URL:-http://${PREVIEW_HOST}:${PREVIEW_PORT}}"
export PREVIEW_PORT

PREVIEW_PID=""

cleanup() {
  if [[ -n "$PREVIEW_PID" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
  fi
  if [[ -f "$PREVIEW_LOG" ]]; then
    rm -f "$PREVIEW_LOG"
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -f "$PREVIEW_SERVER" ]]; then
  echo "[bdd-login] preview server not found at $PREVIEW_SERVER" >&2
  exit 1
fi

HEALTH_URL="$BDD_BASE_URL/"
if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  echo "[bdd-login] reusing existing preview server on $BDD_BASE_URL"
else
  pushd "$FEATURE_DIR" >/dev/null
  PREVIEW_HOST="$PREVIEW_HOST" PREVIEW_PORT="$PREVIEW_PORT" \
    bun "$PREVIEW_SERVER" >"$PREVIEW_LOG" 2>&1 &
  PREVIEW_PID=$!
  popd >/dev/null

  echo "[bdd-login] starting preview server (pid=$PREVIEW_PID) on $BDD_BASE_URL"

  for i in {1..30}; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      echo "[bdd-login] preview server is up"
      break
    fi
    if [[ -n "$PREVIEW_PID" ]] && ! kill -0 "$PREVIEW_PID" 2>/dev/null; then
      echo "[bdd-login] preview server crashed during startup; log follows:" >&2
      cat "$PREVIEW_LOG" >&2 || true
      exit 1
    fi
    sleep 1
  done

  if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[bdd-login] preview server did not become ready in 30s" >&2
    cat "$PREVIEW_LOG" >&2 || true
    exit 1
  fi
fi

cd "$FEATURE_DIR"
exec npx cucumber-js "$@" ${BDD_ARGS:-}
