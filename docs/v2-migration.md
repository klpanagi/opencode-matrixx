# OpenCode V2 Migration — Status and Next Steps

> **Audience:** engineers continuing the migration. Not a user guide.
> **State as of:** 2026-09-26 · branch `feat/opencode-v2-migration` @ `1858237f0`
> **See also:** `v2-smoke.md` (the Docker harness), `hooks.md`, `configurations.md`

This page is the durable record of the OpenCode V1 → V2 plugin-API migration: what is
done, what is verified, what is still broken, and the dependency-ordered plan for
removing V1 support.

> **This file is tracked in git.** The planning artifacts under `.matrixx/` (the plan,
> the notepads, the shim-gate criteria) are **gitignored** and therefore local-only.
> Anything that must outlive a clone belongs here.

---

## TL;DR

| | |
|---|---|
| **V1** | Fully working. Default runtime for all current users. |
| **V2** | Working. 19 of 22 client members verified against a real V2 host; 13 of 14 agents registered. Three upstream gaps remain. |
| **Verified how** | Docker container against `@opencode/cli@2.0.18`, not fake-`ctx` unit tests. |
| **Decision** | Drop V1 compatibility. Not forced by any upstream deadline — see [§4](#4-is-opencode-dropping-v1-no). |
| **Blocking next step** | Nothing is released. 4 commits are local-only. See [§7](#7-p0--ship-what-exists). |
| **Biggest remaining cost** | Group 3 of the removal plan: ~24.5k LOC that is a **rewrite**, not a deletion. See [§6](#6-v1-removal-plan). |

---

## 1. Where the work stands

### 1.1 Git state

```
branch   feat/opencode-v2-migration
commits  da0ca8506  feat(plugin): add OpenCode V2 plugin API support alongside V1
         60dbcc67e  V1→V2 context adapter + Docker smoke harness + negative findings
         fc39e7235  feat(plugin): back the V2 plugin context with a V2-native client shim
         1858237f0  fix(plugin): introduce Matrixx agents on V2 via editor.update, not config reload
```

**Nothing is pushed.** `dev`, `master`, and all `origin/*` refs are still at
`3124b2a25` (tag `v2.6.13`). OpenCode-matrixx's V2 support is unpublished and unknown
to any user.

### 1.2 Gates

| Gate | Result |
|---|---|
| `bun run typecheck` | exit 0 |
| `bun run lint` | exit 0 — 1 **pre-existing** warning, `src/cli/setup/preset-wizard.ts:4` |
| `bun run build` | exit 0 — `dist/index.js`, `dist/cli.js`, both schemas |
| `bash script/run-ci.sh` | **8/8 steps passed** |
| CI gate (non-mock-heavy) | **3538 pass / 0 fail** across 331 files |
| `dist/index.js` export keys | exactly `["default"]`; `id === "matrixx"`; `setup` is a function |
| escape hatches in `src/` | 11, all pre-existing in untouched files |

### 1.3 Definition-of-Done burn-downs (all zero)

| Grep | Before | Now |
|---|---|---|
| `PluginInput` in `src/` | 117 | **0** |
| `@opencode-ai/plugin/tool` in `src/` | 30 | **0** |
| Old V1 hook literals in `src/**/*.ts` | 61 | **0** |
| V1 loader modules in `src/` | 14 | **0** |

### 1.4 What was actually built

V1 and V2 both run from **one build** via a dual-shape entry
(`src/index.ts` → `Object.assign(v1Plugin, v2Plugin)`).

- `src/plugin/v2/` — 11 modules: 6 hook registrations with LIFO-dispose `Cleanup`, a
  tool contract, a component registrar (`agent`/`skill`/`command`/`mcp.transform`),
  an MCP server registry, a guard chain, and an ordered permission-policy engine.
- `src/plugin/v2/shim/` — 579 LOC. A V2-backed client that keeps **V1 method names**,
  so the ~80 existing hook factories work unchanged.
- `src/features/background-agent/{session-ops,v1-session-ops,v2-session-ops}.ts` and
  `src/features/session-steering/*` — runtime-agnostic session create/prompt/move and
  steering/queue delivery.
- `script/v2-docker-smoke.sh` + `script/v2-docker/` — the integration harness.
- CI: `test-v2` (required) and `test-v1-compat` (advisory, non-blocking).

---

## 2. V2 capability matrix

Verified by probe against a real V2 server. The probe includes a **negative control**
(`__spa_control__` at a nonexistent route), which is what makes the positive results
meaningful rather than vacuous.

Route-probe tally: **52 REAL_JSON / 6 MISSING / 4 SPA_HTML / 3 NO_CONTENT**.
21 members probed · 17 verified non-empty · 4 rejected (3 real gaps + the control).

### 2.1 Working

| Area | Status |
|---|---|
| Config load, context-mode, DCP profile switch | working |
| `session.messages` (74 call sites) | working — via `message.list` **and** `session.context` |
| `session.promptAsync` / `prompt` | working — via `session.prompt` |
| `session.create` / `get` / `status` / `abort` / `summarize` / `delete` | working |
| `model.list`, `provider.list`, `config.get`, `command.list`, `app.agents` | working |
| Agents | **13 introduced + 2 refined = 15** via `ctx.agent.transform` + `editor.update` |
| Ordered permission denies (deny-over-allow) | enforced on V2 |
| Read-only agent denies (sentinel et al.) | enforced on V2 |
| Hooks | fire on a live turn — 218–223 events / 38 types observed |

### 2.2 Not working — three upstream gaps

Declared in `V2_CAPABILITY_GAPS` (greppable, listed at runtime, logged at setup).

| Gap | Call sites | Behaviour | Cause |
|---|---|---|---|
| `session.todo` | **16** | rejects | 404 on V2; no `todo` type anywhere in the V2 surface |
| `tui.showToast` | **11** | logged no-op | no V2 TUI domain; 404 on `/api/`, SPA on the V1 path |
| `session.revert` | 0 | rejects | advertised by the V2 client, 404 on the server |

These are **upstream V2 limitations**, not Matrixx bugs. `session.todo` is the only one
that removes real functionality — it drives `todos-todowrite-disabler`.

### 2.3 Two risks that are not gaps but are unproven

1. **No end-to-end model turn has been verified.** Everything above was proven in a
   container with **no model credentials and no auth**. The message envelope
   (`message-envelope.ts`, all 11 variants) is implemented but only the `idle` variant
   was observed live.
2. **The server endpoint is a guess.** V2 exposes no endpoint on `Context` and sets no
   `OPENCODE_*` env var. Port 4096 is correct by default, but a `--port` override
   breaks every `client.*` call **at runtime, not at load**. Currently labelled via
   `endpointConfirmed` — labelling is not fixing.

---

## 3. The finding that unlocked V2

Worth recording because it invalidated a plausible design.

**Every V2 route lives under `/api/`.** The V1 SDK client requests **unprefixed** paths
(`/config`, `/session`, `/agent`). So all 13 V1 routes hit the V2 SPA — which answers
**unknown GET paths with HTTP 200**.

The consequence was nasty and is the reason the harness has a negative control: the V1
client produced plausible **empty** data instead of an error, and Matrixx logged
`providerCount: 0` as a success. Unit tests with a fake `ctx` passed (54 of them) while
the integration was completely broken.

The fix is `src/plugin/v2/shim/` — one module that keeps V1 method names and backs them
with `@opencode/client`, instead of ~30 edits across 97 files. It fails loud:
`V2ShimProtocolError` throws on HTML bodies, non-JSON, and empty results. That was
tested, not assumed — pointed at a server returning SPA for everything, it reports 22
SPA routes and **exits 1**.

---

## 4. Is OpenCode dropping V1? No

The question was asked to justify removing V1 support. The answer does not support it —
but the decision still stands, on scope grounds. Both halves matter.

### 4.1 The evidence: V1 is not deprecated

- `opencode-ai@1.18.32` published **2026-09-21** — five days before this assessment —
  on a 2–5 day cadence that **continued through the V2 GA window** (~15 stable releases
  after V2 went stable). 5,332 stable versions total.
- **No `deprecated` field** on `opencode-ai`, `opencode2`, or `@opencode/cli`.
- **No EOL, sunset, or deprecation text** anywhere in the source, docs, or specs. The
  repo's entire deprecation machinery is aimed at two obsolete auth plugins.
- The `dev` tip commit is still V1 work.
- `opencode.ai/docs/` still serves the V1 documentation.
- V2 releases **18 stable versions in 14 days** and is clearly the going-forward line —
  by *activity*, not by announcement.

V2 is deliberately installable side-by-side: `@opencode/cli` ships **both** bin names
(`opencode` and `opencode2`) pointing at the same binary.

> **Repo gotcha:** `sst/opencode` now redirects to `anomalyco/opencode`. All `gh`
> searches scoped to `sst/opencode` silently return **zero** results, which reads as
> "no evidence exists". Always target `anomalyco/opencode`.

### 4.2 What *is* broken: V1 plugins on V2

This is the mirror image of the assumption, and it is already live.

| Issue | What it says |
|---|---|
| [#48138](https://github.com/anomalyco/opencode/issues/48138) | "backward compatibility for v1 plugins in v2", open since 2026-09-09. "These stop loading on upgrade and the only fix is a full rewrite." |
| [#50590](https://github.com/anomalyco/opencode/issues/50590) | The published SDK's own `Plugin` **type** says function; the v2 loader **rejects** functions. *"The type-level API and the runtime contract disagree, so the plugin compiles cleanly and then fails only at load time."* |
| [#50404](https://github.com/anomalyco/opencode/issues/50404) | "AgentEditor has no `add()`, so a plugin cannot register a new agent" — the exact problem hit here. |
| #49608, #50434 | Local plugin paths fail to load; `@opencode/plugin` unresolvable from a local plugin. |
| #47018, #51247 | Side-by-side shared-state conflicts; `HTTPS_PROXY` broken on v2. |

`Object.assign(v1Plugin, v2Plugin)` is precisely the "documented dual export" that
commenters on #48138 call a workable migration path — and two of them argue upstream
should **keep** it: *"I'd argue for keeping it supported rather than requiring a flag
day"* and *"there are going to be plugins that aren't maintained and won't be ported to
v2 but are still useful"*. A ready branch exists at
`github.com/f15u/opencode/tree/feat/legacy-plugin-compat`.

**Community demand currently runs toward keeping V1 compat, not away from it.**

### 4.3 Upstream's own migration guide

> **Correction worth preserving:** an early research pass concluded "no migration guide
> exists" after probing `opencode.ai/docs/v2/` (404). That is the wrong path. The guide
> is at **`opencode.ai/v2/docs/migrate-v1`**.

Key quotes:

- *"OpenCode 2.0 is in **beta**. Features may break unintentionally, and **the server
  and plugin APIs may continue to change**."*
- *"OpenCode 1 and OpenCode 2 can be installed side by side."*
- Three intentional breaks: **new plugin API**, **new server/client contracts**, and
  `tui.json` → one global `cli.json` (**auto migrated**).
- *"The V1 config format remains supported. The native V2 format is optional."*
- V2 reads V1 config from the same locations and *"translates it in memory without
  rewriting the source file"*.
- **Upstream already migrates `tui.json` → `cli.json`**, and *"leaves the V1 files
  unchanged so V1 can continue using them"*. ⇒ Matrixx's own
  `migrateOpencodeCliConfig()` may now be duplicating upstream work; re-evaluate.
- Plugin config renames `plugin` → `plugins`; local plugins load from
  `.opencode/plugin/` **and** `.opencode/plugins/`.

### 4.4 The honest position

Dropping V1 is a **scope and maintenance** decision, not a deadline response. The
strongest argument for it has nothing to do with upstream:

> The dual-shape entry is a compatibility surface with a long tail, and V1 and V2 now
> genuinely diverge — three capability gaps plus the endpoint guess. Every future change
> must be reasoned about twice.

Removing that is worth it regardless of what upstream does.

### 4.5 Tripwires

Upstream has given no dates. Watch for:

- `opencode-ai` gaining a `deprecated` field on npm, or
- #48138 closing as *wontfix*.

Neither has happened.

---

## 5. What the V1-compat surface actually is

Full census before cutting anything.

| Surface | Size | Note |
|---|---|---|
| `@opencode-ai/plugin` imports | 20 in `src/`, **64 in `tests/`** | the hidden cost |
| `@opencode-ai/sdk` imports | 47 in `src/` (23 are pure `import type` — trivial), 8 in tests | ~12 have real runtime client dependence |
| `v1Plugin` half of `src/index.ts` | 78 of 216 LOC | only `injectServerAuthIntoClient` + `startTmuxCheck` are truly V1-exclusive |
| `src/compat/v1-shim.ts` | 18 LOC | **100% vestigial** — imported by nothing |
| `V1_HOOK_KEYS` | **61 `src/` files, 190 occurrences** | the literal key strings of the hook objects both runtimes consume |
| `HookNameSchema` | 66 V1 names | backs the user-facing `disabled_hooks` |
| `src/hooks/` | 23,473 LOC / 61 files | references `V1_HOOK_KEYS` |
| 6 × `create-*-hooks.ts` | 791 LOC | all return V1-keyed objects, consumed by **both** paths |
| `src/cli/runtime/in-memory.ts` | 19 LOC | `createInMemoryRuntime` has **0 callers in `src/`**, 1 in tests |
| `script/mock-heavy-list.txt` | 45 entries | **0 are V1-only** |

**The architectural fact that governs everything:**

> `v2Plugin` calls `createV1ContextFromV2` and then reuses `createManagers`,
> `createTools`, `createHooks`, and `createPluginInterface` **verbatim**. The V1 shape is
> not a separable layer — it *is* the shared implementation, and the V2 path depends on
> it entirely. `src/plugin/v2/context-adapter.ts` (104 LOC) synthesises a fake V1
> `client` over `@opencode/client` plus a fake `Project`, and **every** `ctx.client.*`
> call in **every** hook goes through it.

### 5.1 Things that look like V1 but are not

Do not delete these with the sweep:

- **`tests/shared/permission-compat.test.ts`** (178 LOC) — misnamed and misfiled. It
  covers the legacy agent `permission: {write:"deny"}` block migration, which is live
  and user-facing. **Re-home it**, do not delete it.
- **`_migrations`** in the config schema — records *Matrixx's own* config migrations.
  Unrelated to the plugin API version.
- **`src/shared/migration/hook-names.ts`** — a user-config deprecation, not API compat.
- **`mergeConfigs`** in `src/plugin-config.ts` — the project-vs-user precedence merge.
  There is no dual V1/V2 config merge to remove.
- All six `disabled_*` keys — read by **both** runtimes. Only the name vocabulary is V1.

### 5.2 Two things that are already dead

- **`V1_TO_V2_HOOK_NAMES`** — 0 runtime consumers (3 test assertions only).
- **`V1_TO_V2_AGENT_NAMES`** — a 14-entry *identity* map. 0 runtime consumers. It renames
  nothing.

---

## 6. V1 removal plan

Dependency-ordered. Groups 0–1 are the realistic near-term win; Group 3 is a project.

### Group 0 — vestigial, zero dependents · ~50 src / ~450 test LOC · low risk

| Item | LOC |
|---|---|
| `src/compat/` (the shim) | 18 |
| `V1_TO_V2_HOOK_NAMES` + re-export + 3 test assertions | ~10 |
| `V1_TO_V2_AGENT_NAMES` + re-export + 1 test | ~20 |
| stale comment in `tests/plugin/v2-guard-registration.test.ts:14` | 1 |
| unused `_ctx` param in `src/plugin-config.ts:74` | 1 |
| `"v1"` member of the `SessionSteering["runtime"]` union | 1 |
| 4 of the 5 V1-only test files (**keep** `permission-compat.test.ts`) | 433 |

**One clean PR, no dependencies. Start here.**

### Group 1 — dead V1 halves · ~139 src / ~265 test LOC · low-medium risk

| Item | LOC |
|---|---|
| `src/cli/runtime/in-memory.ts` | 19 |
| `tests/cli/runtime/compat.test.ts` (sole consumer) | 198 |
| `src/features/session-steering/resolve-session-ops.ts` | 20 |
| `src/features/background-agent/v1-session-ops.ts` | 52 |
| `tests/config/hooks-v1-keys.test.ts` (redundant after Group 0) | 67 |

### Group 2 — shape adapters · ~174 src / ~150 test LOC · medium risk

Each has ≤1 production consumer. **Two are blocked** — see [§8](#8-traps-that-will-cost-you).

| Item | LOC | Blocked on |
|---|---|---|
| `src/plugin/tool-definition.ts` + `tests/plugin/tool-contract.test.ts` | 83 + ~150 | converting the 12 `src/tools/*/tools.ts` V1 `ToolDefinition` factories |
| `src/plugin/v2/hook-deps.ts` | 43 | re-keying `plugin-interface.ts` |
| `src/features/session-steering/v1-steering.ts` | 48 | **adding a V2 branch to `resolve-steering.ts`** |

### Group 3 — the wall · ~24.5k LOC · **rewrite, not deletion** · high risk

`src/plugin/types.ts` V1 half (30 consumer files) · `src/plugin-interface.ts` (69) ·
the 6 `create-*-hooks.ts` factories (791) · `src/plugin/v2/context-adapter.ts` (104) ·
`src/config/schema/hooks-v1-keys.ts` (51) · `HookNameSchema`'s 66 names ·
`tool-execute-before/after` · 12 `tools/*/tools.ts`.

Required sequence — **do not reorder**:

1. Re-key the six hook factories and `plugin-interface.ts` to V2 names.
2. Add the V2 branch to `resolve-steering.ts`.
3. Convert the 12 V1 `ToolDefinition` factories in `src/tools/*/`.
4. **Only then** delete the V1 half of `types.ts` and `context-adapter.ts`.

### Group 4 — dependencies and build · last · 0 LOC, highest verification cost

Two `package.json` deps. `build:plugin` bundles the V1 packages (they are not in the
external list). **`build:cli` has no `--external` at all** — that is precisely why the
V1 SDK is quarantined in `in-memory.ts`. Dropping `@opencode-ai/sdk` requires proving
nothing else in the CLI graph pulls it transitively, or `node dist/cli.js` breaks with
`__require is not a function`.

### Group 5 — CI · own PR · low risk

`test-v1-compat` job (`.github/workflows/ci.yml:95-112`) + the stale comment block
(`:79-94`) + `run-ci.sh` step 6 (`:75-79`). `script/mock-heavy-list.txt` needs **no**
change (0 V1 entries).

Keep this a **separate PR** so a red V1 job stays observable during the transition.

### Reclaim summary

| Group | src LOC | test LOC | Risk |
|---|---|---|---|
| 0 | ~50 | ~450 | low |
| 1 | ~139 | ~265 | low-med |
| 2 | ~174 | ~150 | medium |
| **0–2 total** | **~363** | **~865** | |
| 3 | ~24,500 (rewrite) | — | high |
| 4–5 | ~40 | — | low / high |

**Realistic near-term reclaim: ~360 src + ~865 test LOC.** The remaining ~63k LOC of
`src/` (agents, shared, features, mcp) is version-agnostic and untouched.

---

## 7. P0 — ship what exists

Nothing above matters until it ships.

1. **Push and open a PR against `dev`.** Merge-commit only; squash is disabled
   repo-wide. 4 commits are local-only.
2. **Release note for the V1 `documentReaderGuard` break.** It was constructed but never
   invoked, so binary-document reads were unenforced. Now wired: reading a `.pdf`,
   `.png`, or `.docx` directly is **blocked** and redirected to the `document_reader`
   MCP. Suppress with `disabled_hooks: ["document-reader-guard"]`.
3. **Move `tests/hooks/document-reader-guard-v1-wiring.test.ts`** out of the
   non-blocking `test-v1-compat` job into `test-v2`, so it actually gates a merge.
4. **Re-record the shim-removal decision.** The rationale in `ci.yml:79-94` and
   `src/compat/v1-shim.ts:10-11` cites *"V2 cannot introduce agents (no `AgentEditor.add`)"*.
   That is **refuted** by commit `1858237f0` and by the correction note in
   `src/plugin/v2/agent-partition.ts:4-17`. Do not leave a false record in the tree.

## 8. Traps that will cost you

Each of these was hit during this migration.

1. **Never infer an API from a `.d.ts` — read the implementation.** This bit us twice:
   `AgentEditor` has no `add`, but `update` *creates*; and the plan's `OpenCode.create`
   does not exist (the real factory is `createOpencode()`). A whole wave was built on
   the first false premise and the resulting `agent-partition.ts` gate suppressed all 14
   agents.
2. **Fake-`ctx` unit tests are not integration evidence.** The refuted V1-SDK adapter
   passed 54 of them. Assert on parsed JSON shape, **never** HTTP status — V2 answers
   unknown GET paths with its SPA at 200. Always include a negative control.
3. **`rtk rg` redacts the search term and truncates.** Truncation already produced one
   wrong conclusion. Use plain `grep -rl`, or `find … -print0 | xargs -0 grep -lE`.
4. **In `zsh`, quote `--include=*.ts`** or it becomes `zsh: no matches found` and
   reports a false `0`. This happened twice, once nearly producing a second wrong
   conclusion.
5. **`resolveSessionSteering` has no V2 branch.** Deleting `v1-steering.ts` first breaks
   mission continuation *and* task-continuation enforcement — two live hooks. Add the
   branch before removing V1.
6. **`HookNameSchema` (66 names) cannot be re-typed to `V2HookNameSchema` (10).** Only
   6 have V1 counterparts; `title`, `model.request`, `retry`, `evaluate` are V2-native.
   There is no 1:1 mapping for 60 of 66. This needs a deprecation path, not a type swap.
7. **The six `disabled_*` keys need release-note deprecation messaging**, not silent
   removal.
8. **`tui.json` read path should outlive V1 support by one release.** Only the
   copy/write side is V1-conditional. And check whether upstream's own auto-migration
   makes ours redundant.
9. **`ctx_execute` does not inherit the working directory.** Pass `cwd` to `execSync`
   rather than a `cd` line.
10. **`task-edit-guard` blocks any bash whose text contains a literal
    `.matrixx/plans/*.md` path**, even for read-only greps.

## 9. Verification

```bash
# full local CI — the only authoritative gate
bash script/run-ci.sh                    # expect 8/8

# integration: real V2 host in Docker (image ~1.7GB)
bun run build
./script/v2-docker-smoke.sh             # expect exit 0; artifacts in .matrixx/v2-smoke/out/

# spot checks
node dist/cli.js --help | grep -E "doctor"
bun test tests/features/task-storage/parallel-session-race.test.ts   # 2+ parallel sessions, one task dir
```

Never validate with a naive directory aggregate such as `bun test tests/tools/` — it
shows ~87 pre-existing failures from `mock.module()` cross-file pollution. Run
mock-heavy entries one process per entry, exactly as `run-ci.sh` does.

## 10. Upstream asks worth filing

- **#50404** — report the `editor.update` workaround for agent registration. The `.d.ts`
  actively misleads, and it misled this project twice.
- Publish a **v1→v2 event-name migration table** (requested in
  anomalyco/opencode#40808), plus a transition-window shim that forwards legacy event
  names with a deprecation warning. Matrixx's `V1_HOOK_KEYS` centralization is a working
  reference implementation.
- Expose the **server endpoint on `Context`** (see §2.3).
- `session.todo` and a `tui` toast equivalent (see §2.2).
- The `@opencode-ai/plugin` `Plugin` type should match the v2 loader's runtime contract,
  which would turn a silent load-time failure into a compile error (#50590).

## 11. Version pinning

`@opencode/plugin`, `@opencode/client`, `@opencode/sdk` are pinned **exactly** to
`2.0.16`. Upstream is at **2.0.18** — one patch available and unexploited. Bump
deliberately, not automatically: V2 is in beta and the APIs are explicitly still moving.

V2 dependencies are externalized in `build:plugin`
(`--external "@opencode/*"`). The V1 packages are **bundled**.

## 12. Artifact map

| Path | What it is |
|---|---|
| `src/index.ts` | dual-shape entry; `v1Plugin` L30-107, `v2Plugin` L109-197 |
| `src/plugin/v2/context-adapter.ts` | **the wall** — synthesises a V1 context from V2 |
| `src/plugin/v2/shim/` | V2-backed client keeping V1 method names; `V2_CAPABILITY_GAPS` |
| `src/plugin/v2/agent-partition.ts` | documents the `update`-introduces correction |
| `src/plugin/v2/hook-deps.ts` | V1→V2 hook shape adapter (Group 2) |
| `src/plugin/types.ts` | V1 half has 30 consumer files (Group 3) |
| `src/config/schema/hooks-v1-keys.ts` | `V1_HOOK_KEYS`; 61 importers (Group 3) |
| `src/features/session-steering/resolve-steering.ts` | V1-only, **no V2 branch** |
| `src/cli/runtime/in-memory.ts` | V1 fallback (Group 1) |
| `src/config/opencode-cli-config.ts` | `tui.json`→`cli.json` copy; may be redundant with upstream |
| `script/v2-docker-smoke.sh` | integration harness — **not in CI** |
| `docs/v2-smoke.md` | harness docs + operator runbook |
| `.github/workflows/ci.yml` | `test-v2` L44 · `test-v1-compat` L95-112 (comment L79-94 is stale) |
| `.matrixx/` | **gitignored** — plan, notepads, shim-gate criteria, Docker artifacts |
