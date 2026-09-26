#!/usr/bin/env bash
# OpenCode V2 plugin smoke test.
#
# Boots the real V2 server (@opencode/cli) inside Docker with the built
# Matrixx plugin bundle, then records what the V2 host actually does: whether the
# plugin loads, which endpoint it publishes, whether the V1 SDK routes the
# adapter depends on still exist, whether the Matrixx agents are visible, and
# whether a V2 hook reaches our handler.
#
# The script REPORTS. It only fails when the harness itself could not run (no
# Docker, image build failure, container never started) — never because the
# product behaved in a way we did not predict.
#
# Usage:
#   script/v2-docker-smoke.sh              # build + run
#   KEEP_CONTAINER=1 script/v2-docker-smoke.sh   # keep container for inspection
#   OUT_DIR=/tmp/somewhere script/v2-docker-smoke.sh
set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
IMAGE=${IMAGE:-matrixx-v2-smoke:latest}
CONTAINER=${CONTAINER:-matrixx-v2-smoke}
OUT_DIR=${OUT_DIR:-"$REPO_ROOT/.matrixx/v2-smoke/out"}
KEEP_CONTAINER=${KEEP_CONTAINER:-0}
KEEP_IMAGE=${KEEP_IMAGE:-0}
READY_TIMEOUT=${READY_TIMEOUT:-180}

HARNESS_ERRORS=0

log()  { printf '%s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*" >&2; }
fail() { printf 'ERROR %s\n' "$*" >&2; HARNESS_ERRORS=$((HARNESS_ERRORS + 1)); }

cleanup() {
  if [ "$KEEP_CONTAINER" != "1" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    log "KEEP_CONTAINER=1: container $CONTAINER left running"
  fi
}
trap cleanup EXIT

require() {
  command -v "$1" >/dev/null 2>&1 || { fail "required command not found: $1"; return 1; }
}

require docker || exit 2
docker info >/dev/null 2>&1 || { fail "docker daemon not reachable"; exit 2; }

[ -f "$REPO_ROOT/dist/index.js" ] || {
  fail "dist/index.js missing — run 'bun run build' first"
  exit 2
}

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

log "== V2 smoke: building image $IMAGE"
docker build -f "$REPO_ROOT/script/v2-docker/Dockerfile" -t "$IMAGE" \
  "$REPO_ROOT/script/v2-docker" || { fail "image build failed"; exit 2; }

log "== V2 smoke: running container (timeout ${READY_TIMEOUT}s)"
docker run --rm --name "$CONTAINER" \
  -v "$REPO_ROOT:/repo:ro" \
  -v "$OUT_DIR:/work/out" \
  -e MATRIXX_PLUGIN_PATH=/repo/dist/index.js \
  -e MATRIXX_LOG=/tmp/matrixx.log \
  "$IMAGE" 2>&1 | tee "$OUT_DIR/container.log"
CONTAINER_STATUS=${PIPESTATUS[0]}

if [ "$CONTAINER_STATUS" -ne 0 ]; then
  fail "container exited with status $CONTAINER_STATUS"
fi

log ""
log "== V2 smoke: observations"

report_file() {
  local file=$1
  if [ -f "$OUT_DIR/$file" ]; then
    cat "$OUT_DIR/$file"
  else
    echo "(missing: $file)"
  fi
}

# ---- Q1 / Q2: what did the V2 host publish, and did plugins load? ----------
log ""
log "-- Q1/Q2: server endpoint --"
report_file server-endpoint.txt

PLUGIN_LOADED="no"
if [ -f "$OUT_DIR/probe-plugin.json" ]; then
  PLUGIN_LOADED="yes"
  log "-- Q1: probe plugin setup() ran (V2 loads file-path plugins) --"
else
  log "-- Q1: probe plugin never ran — V2 did not load file-path plugins --"
fi

if [ -f "$OUT_DIR/matrixx.log" ]; then
  log "-- Q1: Matrixx log found at /tmp/matrixx.log inside the container --"
  log "   lines: $(wc -l < "$OUT_DIR/matrixx.log")"
  log "   first lines:"
  head -20 "$OUT_DIR/matrixx.log" | sed 's/^/     /'
else
  log "-- Q1: no /tmp/matrixx.log — Matrixx setup() did not reach the logger --"
fi

if [ -f "$OUT_DIR/probe-plugin.json" ]; then
  log ""
  log "-- Q1: V2 plugin context (as observed by the probe plugin) --"
  node -e '
    const r = require(process.argv[1]);
    console.log("   ctx keys:", JSON.stringify(r.ctxKeys));
    console.log("   location:", JSON.stringify(r.location));
    console.log("   runtime:", JSON.stringify(r.runtime.versions), r.runtime.execPath);
    console.log("   OPENCODE_* env presence:", JSON.stringify(r.envPresence));
  ' "$OUT_DIR/probe-plugin.json" 2>/dev/null || report_file probe-plugin.json
fi

# ---- Q3: do the V1 SDK endpoints still exist on V2? -----------------------
log ""
log "-- Q3: V1 SDK client (@opencode-ai/sdk) against the V2 server --"
log "   NOTE: the V2 server answers unknown GET paths with its SPA HTML at HTTP 200,"
log "   so a 200 alone is NOT evidence that a V1 route exists. Verdict is by body."
if [ -f "$OUT_DIR/v1-client-probe.json" ]; then
  node -e '
    const r = require(process.argv[1]);
    const rows = Object.entries(r)
      .filter(([k]) => !["baseUrl","directory","authSupplied"].includes(k))
      .map(([k, v]) => {
        const body = String(v.preview ?? v.error ?? "");
        const isHtml = body.includes("!doctype html") || body.includes("doctype HTML");
        const verdict = v.verdict === "ok" && isHtml ? "SPA-HTML" : v.verdict;
        return [k, verdict, v.error ? String(v.error).slice(0,60) : body.slice(0,50)];
      });
    const w = Math.max(...rows.map((x) => x[0].length));
    for (const [name, verdict, note] of rows) {
      console.log("   " + name.padEnd(w) + "  " + verdict.padEnd(10) + " " + note);
    }
  ' "$OUT_DIR/v1-client-probe.json"
else
  log "   (no v1-client-probe.json)"
fi

log ""
log "-- Q3b: raw REST status codes (context-type checked) --"
if [ -f "$OUT_DIR/http-probe.json" ]; then
  node -e '
    const r = require(process.argv[1]);
    for (const [name, v] of Object.entries(r.gets)) {
      const ct = String(v.contentType ?? "");
      const html = String(v.bodyPreview ?? "").includes("!doctype html");
      console.log("   " + name.padEnd(24) + String(v.status).padEnd(5) + (ct.split(";")[0]||"?").padEnd(24) + (html ? "SPA-HTML (V1 route absent)" : "json"));
    }
  ' "$OUT_DIR/http-probe.json"
fi

# ---- Q4 / Q5: agents and hook firing --------------------------------------
log ""
log "-- Q4/Q5: V2-native view (agents, tools, plugins, events) --"
if [ -f "$OUT_DIR/v2-client-probe-2.json" ]; then
  node -e '
    const r = require(process.argv[1]);
    console.log("   session id created:", r.sessionId);
    console.log("   agents on V2:", JSON.stringify(r.agentIds));
    console.log("   matrixx agents present:", JSON.stringify(r.matrixxAgentsPresent));
    console.log("   matrixx agents missing:", JSON.stringify(r.matrixxAgentsMissing));
    const ours = (r.pluginIdsAfter||[]).filter((p) => /matrixx|smoke|probe/i.test(p));
    console.log("   non-builtin plugins registered:", JSON.stringify(ours));
    console.log("   total plugins on V2:", (r.pluginIdsAfter||[]).length);
  ' "$OUT_DIR/v2-client-probe-2.json"
else
  log "   (no v2-client-probe-2.json)"
fi

log ""
log "-- Q1: how the built bundle presented itself to V2 --"
if [ -f "$OUT_DIR/matrixx-load.json" ]; then
  log "   as shipped (default export is a function with id/setup):"
  sed 's/^/     /' "$OUT_DIR/matrixx-load.json"
fi
if [ -f "$OUT_DIR/matrixx-load-object.json" ]; then
  log "   re-exported as a plain object (diagnostic):"
  sed 's/^/     /' "$OUT_DIR/matrixx-load-object.json"
fi

HOOK_EVIDENCE=$(grep -c " event " "$OUT_DIR/probe-plugin-trace.log" 2>/dev/null || echo 0)
log ""
log "   V2 events observed by the probe plugin: $HOOK_EVIDENCE"
log "   Matrixx setup() reached the logger: $([ -f "$OUT_DIR/matrixx.log" ] && echo yes || echo no)"

log ""
log "== V2 smoke: artefacts in $OUT_DIR"
ls -1 "$OUT_DIR" | sed 's/^/   /'

if [ "$HARNESS_ERRORS" -ne 0 ]; then
  log ""
  log "== HARNESS FAILED ($HARNESS_ERRORS harness problem(s))"
  exit 1
fi

log ""
log "== Harness completed. Observations above are reported, not asserted."
exit 0
