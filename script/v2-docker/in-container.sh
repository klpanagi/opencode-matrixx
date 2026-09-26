#!/bin/sh
# Runs the OpenCode V2 smoke test inside the container.
#
#   1. start the real V2 server (`opencode serve`) with two plugin DIRECTORY
#      entries — a wrapper around the built Matrixx bundle, and a neutral probe
#      plugin that records what the V2 host actually hands a plugin,
#   2. record what the V2 host publishes (URL, port, password, env),
#   3. probe whether V2 still serves the V1 SDK endpoints Matrixx depends on,
#      with a V1 SDK client built exactly as context-adapter.ts builds it,
#   4. drive one real session creation so a V2 hook can fire,
#   5. collect every artefact under /work/out.
#
# Nothing here asserts a product expectation. It records observations; the
# host-side script decides pass/fail from those observations.
set -u

OUT=/work/out
PROJ=/work/project
WRAP=/work/matrixx-plugin
PROBE=/opt/v2-cli/probe-plugin
CLI=/opt/v2-cli/node_modules/@opencode/cli/bin/opencode.exe
ENTRY=${MATRIXX_PLUGIN_PATH:-/repo/dist/index.js}
LOAD_OUT=${MATRIXX_LOAD_OUT:-/tmp/matrixx-load.json}

WRAP2=/work/matrixx-plugin-object
mkdir -p "$OUT" "$PROJ" "$WRAP" "$WRAP2"
find "$OUT" -type f -delete 2>/dev/null || true

# V2 accepts only plugin DIRECTORIES (or npm packages) in `plugins`. A `.js`
# file path is rejected with "configured plugin path must be a directory" and
# silently dropped, so the built bundle is wrapped in a minimal plugin package
# rather than referenced directly. The repo's own package.json is untouched.
cat > "$WRAP/package.json" <<'JSON'
{
  "name": "matrixx-v2-smoke-wrapper",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "opencode": { "server": "./index.mjs" }
}
JSON

cat > "$WRAP/index.mjs" <<EOF
import { writeFileSync } from "node:fs"

const entry = "${ENTRY}"
const loadOut = "${LOAD_OUT}"
const report = { entry, importStarted: true, imported: false, setupCalled: false }

try {
  const mod = await import(entry)
  const plugin = mod.default
  report.imported = true
  report.exportType = typeof plugin
  report.exportKeys = Object.keys(plugin ?? {}).sort()
  report.hasId = typeof plugin?.id === "string" ? plugin.id : null
  report.hasSetup = typeof plugin?.setup === "function"
  report.hasServer = typeof plugin?.server === "function"
  report.hasV1FunctionExport = typeof plugin === "function"
  if (typeof plugin?.setup === "function") {
    const original = plugin.setup
    plugin.setup = async (ctx) => {
      report.setupCalled = true
      writeFileSync(loadOut, JSON.stringify(report, null, 2))
      return original(ctx)
    }
  }
} catch (error) {
  report.importError = String(error)
  report.importStack = error?.stack ?? null
}

writeFileSync(loadOut, JSON.stringify(report, null, 2))
export default (await import(entry)).default
EOF

# Diagnostic only: the same bundle re-exported as a plain object, to isolate
# whether V2 rejects the function-with-properties default export shape.
cat > "$WRAP2/package.json" <<'JSON'
{
  "name": "matrixx-v2-smoke-wrapper-object",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "opencode": { "server": "./index.mjs" }
}
JSON

cat > "$WRAP2/index.mjs" <<EOF
import { writeFileSync } from "node:fs"
const entry = "${ENTRY}"
const loadOut = "/tmp/matrixx-load-object.json"
const fn = (await import(entry)).default
const shape = {
  fnType: typeof fn,
  fnKeys: Object.keys(fn ?? {}).sort(),
  spreadKeys: Object.keys({ ...fn }).sort(),
}
let setupCalled = false
const plugin = { ...fn }
if (typeof plugin.setup === "function") {
  const original = plugin.setup
  plugin.setup = async (ctx) => {
    setupCalled = true
    writeFileSync(loadOut, JSON.stringify({ ...shape, setupCalled: true }, null, 2))
    return original(ctx)
  }
}
writeFileSync(loadOut, JSON.stringify({ ...shape, setupCalled }, null, 2))
export default plugin
EOF

cat > "$PROJ/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "plugins": ["$WRAP", "$WRAP2", "$PROBE"]
}
JSON

echo "installed CLI version: $(cat /opt/v2-cli/VERSION 2>/dev/null || echo unknown)"
echo "matrixx bundle: $ENTRY"
test -f "$ENTRY" || { echo "FATAL: plugin bundle not found at $ENTRY"; exit 10; }

cd "$PROJ" || exit 11

"$CLI" serve --print-logs --log-level debug > "$OUT/serve.log" 2>&1 &
SERVE_PID=$!

i=0
while [ $i -lt 60 ]; do
  grep -q "server listening" "$OUT/serve.log" 2>/dev/null && break
  kill -0 "$SERVE_PID" 2>/dev/null || break
  i=$((i + 1))
  sleep 1
done

if ! grep -q "server listening" "$OUT/serve.log" 2>/dev/null; then
  echo "FATAL: V2 server never reported a listening address"
  echo "--- serve.log ---"
  cat "$OUT/serve.log"
  exit 12
fi

LISTEN_LINE=$(grep -m1 "server listening" "$OUT/serve.log")
PW_LINE=$(grep -m1 "server password" "$OUT/serve.log" 2>/dev/null || true)
URL=$(printf '%s' "$LISTEN_LINE" | sed -n 's/.*listening on //p' | tr -d '[:space:]')
PASSWORD=$(printf '%s' "$PW_LINE" | sed -n 's/.*server password //p' | tr -d '[:space:]')
PORT=$(printf '%s' "$URL" | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')

{
  echo "listenLine=$LISTEN_LINE"
  echo "advertisedUrl=$URL"
  echo "advertisedPort=$PORT"
  echo "passwordAdvertisedByServer=${PASSWORD:+yes}"
} > "$OUT/server-endpoint.txt"

echo "advertised url: $URL (port $PORT)"
echo "server password advertised on stdout: ${PASSWORD:+yes}"

i=0
while [ $i -lt 40 ]; do
  test -f "$OUT/probe-plugin.json" && break
  i=$((i + 1))
  sleep 1
done

# V2 activates plugins lazily, on real V2-API traffic. V1-style paths are served
# by the V2 SPA catch-all and never reach plugin activation, so a V2-native
# client call is required to make the plugin load at all.
cd /opt/v2-cli || exit 15
cp /opt/v2-smoke/v2-client-probe.mjs /opt/v2-cli/v2-client-probe.mjs
node /opt/v2-cli/v2-client-probe.mjs "$URL" "$PASSWORD" "$PROJ" "$OUT/v2-client-probe.json" \
  > "$OUT/v2-client-probe.log" 2>&1
echo "v2 client probe exit: $?"

# Give activation and setup() a moment, then keep driving the V2 API so a hook
# (session.prompt / tool.execute.*) and the event stream can fire.
i=0
while [ $i -lt 30 ]; do
  test -f "$OUT/probe-plugin.json" && break
  i=$((i + 1))
  sleep 1
done
node /opt/v2-cli/v2-client-probe.mjs "$URL" "$PASSWORD" "$PROJ" "$OUT/v2-client-probe-2.json" \
  > "$OUT/v2-client-probe-2.log" 2>&1
echo "v2 client probe (second pass) exit: $?"

# Asserting probe: the Matrixx agents must be visible on THIS live host.
cp /opt/v2-smoke/agent-listing-probe.mjs /opt/v2-cli/agent-listing-probe.mjs
node /opt/v2-cli/agent-listing-probe.mjs "$URL" "$PASSWORD" "$PROJ" \
  "$OUT/agent-listing-probe.json" "$OUT/agent-listing-probe.exit" /tmp/matrixx.log \
  > "$OUT/agent-listing-probe.log" 2>&1
echo "agent listing probe exit: $?"

# Per-route capability probe: for every V1 member Matrixx calls, record the raw
# V2 route (status + content-type + SPA-vs-JSON) and the V2 client method.
cp /opt/v2-smoke/v2-route-probe.mjs /opt/v2-cli/v2-route-probe.mjs
node /opt/v2-cli/v2-route-probe.mjs "$URL" "$PASSWORD" "$PROJ" "$OUT/v2-route-probe.json" \
  > "$OUT/v2-route-probe.log" 2>&1
ROUTE_PROBE_STATUS=$?
echo "$ROUTE_PROBE_STATUS" > "$OUT/v2-route-probe.exit"
echo "v2 route probe exit: $ROUTE_PROBE_STATUS"

mkdir -p /work/v1probe
cp /opt/v2-smoke/v1-client-probe.mjs /work/v1probe/probe.mjs
ln -sfn /repo/node_modules /work/v1probe/node_modules

cd /work/v1probe || exit 13
node probe.mjs "$URL" "$PROJ" "" > "$OUT/v1-client-probe.json" 2>&1
echo "v1 client probe (no auth, as the adapter builds it) exit: $?"
node probe.mjs "$URL" "$PROJ" "opencode:$PASSWORD" > "$OUT/v1-client-probe-auth.json" 2>&1
echo "v1 client probe (with the server password) exit: $?"

cd "$PROJ" || exit 14
PROBE_BASE="$URL" PROBE_PASSWORD="$PASSWORD" PROBE_DIRECTORY="$PROJ" \
  node /opt/v2-smoke/probe.mjs > "$OUT/probe-run.log" 2>&1
echo "rest probe exit: $?"

sleep 12
if [ -f /tmp/matrixx.log ]; then  cp -f /tmp/matrixx.log "$OUT/matrixx.log"
else
  echo "MATRIXX_LOG_ABSENT" > "$OUT/matrixx.log-absent"
fi
cp -f "$LOAD_OUT" "$OUT/matrixx-load.json" 2>/dev/null || echo "no $LOAD_OUT" > "$OUT/matrixx-load.json"
cp -f /tmp/matrixx-load-object.json "$OUT/matrixx-load-object.json" 2>/dev/null || echo "absent" > "$OUT/matrixx-load-object.json"

kill -TERM "$SERVE_PID" 2>/dev/null
i=0
while [ $i -lt 20 ]; do
  kill -0 "$SERVE_PID" 2>/dev/null || break
  i=$((i + 1))
  sleep 1
done
kill -KILL "$SERVE_PID" 2>/dev/null || true
wait "$SERVE_PID" 2>/dev/null || true

echo "--- serve.log: plugin lines ---"
grep -i "plugin\|matrixx\|directory" "$OUT/serve.log" | head -40
echo "--- serve.log tail ---"
tail -20 "$OUT/serve.log"
echo "--- artefacts ---"
ls -la "$OUT"
exit 0
