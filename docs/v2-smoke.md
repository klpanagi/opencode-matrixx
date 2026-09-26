# OpenCode V2 Plugin Smoke Test

Runs the built Matrixx plugin against a **real** OpenCode V2 host inside Docker and
records what actually happens. It is the empirical counterpart to the fake-`ctx` unit
tests in `tests/plugin/v2/`.

## Running it

```bash
bun run build          # dist/index.js must exist
./script/v2-docker-smoke.sh
```

No secrets are required and nothing outside the repo is touched. The container is
removed on exit.

| Variable | Default | Purpose |
|---|---|---|
| `OUT_DIR` | `.matrixx/v2-smoke/out` | Where artefacts are written |
| `KEEP_CONTAINER=1` | `0` | Leave the container running for inspection |
| `IMAGE` | `matrixx-v2-smoke:latest` | Image tag |
| `READY_TIMEOUT` | `180` | Seconds to wait for the server to listen |

**The script reports; it does not assert.** It exits non-zero only when the *harness*
fails (no Docker, image build error, container never starts). A product behaviour it did
not predict is reported, never failed on.

## Reading the output

| Artefact | What it holds |
|---|---|
| `server-endpoint.txt` | The URL/port the V2 host printed at startup |
| `probe-plugin.json` | What a V2 plugin's `ctx` actually contains, plus `OPENCODE_*` env presence |
| `matrixx.log` | Matrixx's own log from inside the container (`/tmp/matrixx.log`) |
| `matrixx-load.json` | How the shipped bundle presented itself, and whether `setup()` ran |
| `v1-client-probe.json` | A real `@opencode-ai/sdk` client against the V2 server |
| `http-probe.json` | Raw REST status codes with content-type |
| `v2-client-probe-2.json` | V2-native view: agents, tools, registered plugins, session id |
| `probe-plugin-trace.log` | Every V2 event a plugin's `ctx.event.subscribe()` received |
| `serve.log` | Full V2 server log |

## Findings (2026-09-26, `@opencode/cli@2.0.18`, V2 deps 2.0.16)

The V2 host runs in a **Bun** runtime (`bun 1.4.2`, reported `node` 26.3.0), inside
`node:22-slim`, headless, no TTY needed. `opencode serve` is the entry point.

| # | Question | Verdict |
|---|---|---|
| 1 | Does V2 load our plugin? | **Yes, but only as a plugin *directory*.** A `.js` file path is silently dropped. |
| 2 | What port does V2 publish? | **4096 on `127.0.0.1`.** The `port-fallback` guess is correct — but no `OPENCODE_*` variable is set. |
| 3 | Does V2 serve the V1 SDK routes? | **No. Refuted.** Every V1 path falls through to the SPA HTML at HTTP 200. |
| 4 | Are the 14 Matrixx agents visible? | **No.** Only V2's 7 built-ins are. `AgentEditor` has no `add`. |
| 5 | Do V2 hooks fire? | **Yes.** The V2 `session.hook("context")` path reaches our `messagesTransform` handler. |

### 1. Plugin loading requires a directory

`plugins` accepts npm package names, `./relative/dir`, `/absolute/dir` and `file://`
URLs. An absolute path to a **file** is rejected:

> `configured plugin path must be a directory`

and the entry is dropped with no error surfaced to the client — `plugin.list` simply
comes back empty. `@opencode/core` reads the `opencode.server` field of the target
directory's `package.json`; a directory without that field is dropped the same way.
This is why the repo root as a plugin entry is a no-op.

The harness therefore wraps `dist/index.js` in a generated two-file plugin package. The
repo's own `package.json` is deliberately left untouched.

A shipped default export that is a **function carrying `id`/`setup`** was observed to
register on two runs and fail to register within the observation window on a third, with
no diagnostic either way. Treat V2 plugin registration as unreliable until the export
shape is a plain object per the V2 plugin guide.

### 2. Endpoint publication, and the auth trap

The server prints, at startup:

```
server listening on http://127.0.0.1:4096
server password <random>
```

Inside `setup()` a V2 plugin sees **none** of `OPENCODE`, `OPENCODE_PID`, `OPENCODE_PORT`,
`OPENCODE_HOST`, `OPENCODE_SERVER`, `OPENCODE_SERVER_URL`, `OPENCODE_SERVER_USERNAME`,
`OPENCODE_SERVER_PASSWORD`. Consequences:

- `resolveServerEndpoint()` only ever reaches `port-fallback`, because both `OPENCODE_SERVER_URL`
  and `Service.discover()` have nothing to read.
- 4096 happens to be right, so `ctx.serverUrl` resolves correctly **by default only**. Pass
  `opencode serve --port N` and every `client.*` call targets the wrong port.
- `injectServerAuthIntoClient()` is a no-op: it keys off `OPENCODE_SERVER_PASSWORD`, which is absent.
  The generated password is printed to the server's stdout and is not recoverable from a plugin.

### 3. The V1 SDK bet is refuted

This is the load-bearing assumption of the migration and it does **not** hold. V2 answers
unknown `GET` paths with its single-page app at **HTTP 200**, so a status-code-only check
reads as success. Every V1 route returns `text/html`:

| V1 call | V2 response |
|---|---|
| `config.get` | 200 `text/html` — SPA |
| `session.status` | 200 `text/html` — SPA |
| `session.list` | 200 `text/html` — SPA |
| `tui.showToast` | 405 on `POST /tui/show-toast` |
| `provider.list` (model/provider) | 200 `text/html` — SPA |
| `agent.list` | 200 `text/html` — SPA |
| `session.messages` | not served |
| `experimental.tool.ids` | not served |

Worse, the failures are **silent**. Matrixx logged
`Extracted models from provider list {"providerCount":0,"totalModels":0}` — a parsed
empty list, not an error. A V1 client pointed at V2 returns plausible-looking empty data
rather than throwing, so every `client.*` consumer degrades quietly.

`client.agent`, `client.app` and `client.experimental` are additionally `undefined` on the
V1 SDK, so those throw `TypeError` instead.

The V2-native client (`@opencode/client`, `OpenCode.make`) works correctly and is the
replacement: `server.info`, `location.get`, `plugin.list`, `agent.list`, `session.create`,
`session.get`, `session.context`, `session.update` all return real data.

### 4. Agents are not registered

`agent.list` on V2 returns only `build`, `general`, `explore`, `compaction`, `title`,
`summary`, `plan`. None of the 14 Matrixx agents appear. Matrixx confirms the cause:

```
[registerV2Components] components resolved {"agentCount":15,"skillCount":43,"commandCount":19,"mcpCount":3}
[registerV2Components] V2 AgentEditor exposes no add(); unresolvable agents were not introduced
  {"unresolvable":["morpheus","keymaker","oracle","mouse","merovingian","operator","trinity",
                    "construct","seraph","smith","cipher","sentinel","sati"]}
```

Writing `agents` into config and calling `location.reload()` was **not** effective here:
the agents were still absent after reload and after a second activation pass. `build` in
the V2 list is V2's own built-in, not Matrixx's.

### 5. Hooks do fire

`ctx.event.subscribe()` delivered **223 events across 38 distinct types** to the probe
plugin, including `session.created`, `session.execution.started`, `session.tool.called`
and `session.tool.success`. A live agent turn really executed (15 tool calls, 7 shells).

And the Matrixx handler itself ran — from `/tmp/matrixx.log`:

```
[DEBUG] experimental.chat.messages.transform called {"messageCount":0}
```

repeated once per turn. So V2's `session.hook("context")` → `toMessagesTransformCall` →
`deps.messagesTransform` chain is live.

`messageCount: 0` confirms **GAP-10** on a real session: `toMessagesTransformCall` returns
an empty array, so context-injector and keyword-detector remain no-ops on V2.

## Proposed fixes (not applied — no production code was changed)

1. **Server endpoint.** Prefer a real source over the 4096 guess. Read the URL from
   `ctx` if a future V2 exposes it, otherwise fail loudly when neither
   `OPENCODE_SERVER_URL` nor a discovered service is available, instead of silently
   returning a guess that happens to be right.
2. **Auth.** `injectServerAuthIntoClient` needs a password source on V2. Until one exists,
   V2 `client.*` calls cannot be authenticated.
3. **Drop the V1 client on V2.** `createV1ContextFromV2` should not build a V1 SDK client
   against a V2 server. Port the ~30 `client.*` call sites to `@opencode/client` domains,
   and treat empty-but-no-error responses as failures.
4. **Export shape.** Make the default export a plain object per the V2 plugin guide, or
   confirm with the V2 team whether the function-with-properties form is supported.
5. **Agents.** `AgentEditor` has no `add`; config-driven registration plus
   `location.reload()` did not work. Needs a supported V2 path before the 14 agents ship on V2.
6. **GAP-10.** `toMessagesTransformCall` needs a real mapping from V2 messages to the V1
   `{ info, parts }` envelope.

## Harness layout

```
script/v2-docker-smoke.sh          host driver: build, run, report, clean up
script/v2-docker/Dockerfile        node:22-slim + @opencode/cli
script/v2-docker/in-container.sh   start server, drive the API, collect artefacts
script/v2-docker/probe.mjs         raw REST probe with content-type classification
script/v2-docker/v1-client-probe.mjs   @opencode-ai/sdk client against the V2 server
script/v2-docker/v2-client-probe.mjs   @opencode/client, the V2-native path
script/v2-docker/probe-plugin/     neutral V2 plugin that records ctx and events
```
