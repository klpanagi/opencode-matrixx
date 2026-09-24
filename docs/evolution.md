# Matrixx Self-Evolution Loop

> **Audience:** users opting into session learning and engineers extending the loop.
> **Version:** 2.6.10. Default **off** (`evolution.enabled: false` = zero overhead).
> **See also:** `command-reference.md` (`/evolution`), `hooks.md` (`evolution-watcher`, `evolution-compressor`, `evolution-hitl`), `configurations.md` (`evolution.*`).

Self-evolution records what happens in sessions, compresses traces into reusable knowledge, and governs promotion with human-in-the-loop approval. Every session makes the next one smarter.

_Registration gating_: all 3 hooks register only when `evolution.enabled:true` (default `false` = zero overhead; handlers keep defense-in-depth `if (!config?.enabled) return`).

## Architecture, 4 Layers

| Layer | Hook / Module | Trigger | Output |
|-------|---------------|---------|--------|
| 1 Watcher | `evolution-watcher` (`tool.execute.after`) | Every tool call | `TraceRecord` JSONL |
| 2 Compressor | `evolution-compressor` (`compacting` + `idle`/`error`) | Context ~78%, idle >5 traces, error | `DistilledKnowledge` |
| 3 Writer | `EvolutionWriter` | Distilled knowledge | `pending/<slug>.md` + `skills/<slug>/SKILL.md` |
| 4 Governance | `evolution-hitl` + `passesQualityGate()` + `/evolution` tool | Confidence / approval | Promotion to `.opencode/skills/` |

## Storage Layout

```
.matrixx/evolution/
├── traces/
│   ├── ses_abc123.jsonl          # per-session JSONL, append-only
│   └── ses_def456.jsonl
├── skills/
│   └── <slug>/
│       ├── SKILL.md              # staged (mirrors pending)
│       └── meta.json             # full provenance (see Provenance section)
├── pending/
│   ├── <slug>.md                 # awaiting approve/reject via evolution tool
│   └── <slug>.meta.json
├── quarantine/
│   └── <slug>/                   # low-eval skills moved here instead of deleted
├── budget.json                   # daily spend ledger (UTC day-rollover)
├── audit.log                     # JSONL audit trail
└── state.json                    # { totalTraces, totalCompressions, lastCompressionAt, lastPromptAt }

.opencode/skills/<slug>/SKILL.md  # promoted — loaded on next session
~/.agents/skills/<slug>/SKILL.md  # global promotion if writer.globalSkills=true
```

All under `.gitignore` except `.opencode/skills/` (opt-in commit). State/pending use atomic `write + rename`. Traces are append-only JSONL; in-memory ring buffer caps at 500.

## Knowledge Kinds

Every distilled artifact is tagged with one of 5 typed knowledge kinds (`KnowledgeKind` in `src/features/evolution/types.ts`). The Zod normalizer in `schema.ts` falls back to `"convention"` for missing or unknown values (fail-open for backward compatibility).

| Kind | Description |
|------|-------------|
| `workflow` | A repeatable process or sequence of steps |
| `correction` | A fix for a mistake or misunderstanding |
| `debugging_pattern` | A diagnostic approach for a class of bugs |
| `gotcha` | A non-obvious pitfall or surprising behavior |
| `convention` | A preferred style or naming convention (default) |

## Project Identity

`resolveProjectIdentity(root)` in `src/features/evolution/store/project-identity.ts` computes a deterministic project ID:

1. Tries `git remote get-url origin` (or `git config --get remote.origin.url`)
2. If a remote exists: `projectId = "sha256:<hex>"` of the remote URL
3. If no remote: `projectId = "sha256:<hex>"` of the canonical repo-root path (`git rev-parse --show-toplevel`, fallback to `fs.realpathSync(root)`)
4. The remote URL itself is never persisted or logged; only the hash is stored

Results are memoized per canonical root. An injectable `GitRunner` type allows tests to verify git spawns without touching the filesystem.

The special sentinel `"unscoped-legacy"` (`UNSCOPED_LEGACY`) is used when no project ID is available. It is excluded from scoped retrieval: skills with `projectId === "unscoped-legacy"` are not returned when a specific project scope is active.

### Cross-Project Scoped Dedup

When staging, the writer checks whether a base slug already belongs to a different project. If `baseSlug.meta.json` exists with a different `projectId`, the artifact is staged under `slug-<projectSlugSuffix>` where the suffix is `sha256(projectId).slice(0, 8)`. This prevents cross-project collisions while keeping related knowledge discoverable within scope.

## Budget Enforcement

The pipeline enforces three budget caps, checked before every compression run.

### Pending Queue Cap

`retention.maxPending` (default **50**). Before compression starts, the pipeline counts pending proposals via `EvolutionWriter.listPending()`. If the count is at or above the cap, the pipeline returns `{ reason: "max-pending" }` without invoking the compressor. The audit log records `action: "max-pending"`.

### Daily Cost Cap

`budget.maxCostCentsPerDay` (default **100** cents). The budget ledger at `.matrixx/evolution/budget.json` tracks cumulative spend per UTC calendar day. When `isOverDailyCap` is true:

- The paid LLM compressor path is **blocked** (`llmCall` is passed as `undefined`)
- The free offline heuristic **still runs** (compressor degrades to offline mode)
- No usage is recorded (heuristic produces no charge)
- UTC day-rollover: `rollLedger()` resets the ledger when `utcDayKey(now)` differs from the stored day

### Hourly Compression Cap

`budget.maxCompressionsPerHour` (default **10**). The compressor hook checks `shouldThrottle` which short-circuits when pending count is at or above `maxPending`. The hourly cap is tracked via `state.lastCompressionAt`.

### Over-Cap Behavior Summary

| Condition | Compressor | Usage Recorded |
|-----------|-----------|----------------|
| Under both caps | Full LLM compression | Yes (costCents charged) |
| Over daily cost cap | Free offline heuristic only | No (zero cost) |
| Over pending cap | Skipped entirely | No |

## Quarantine, Not Delete

When the evaluator scores a promoted skill below the quality threshold, it does **not** delete the skill. Instead, `quarantineSkill(slug)` in `src/features/evolution/store/lifecycle.ts` moves it to `.matrixx/evolution/quarantine/<slug>/`:

- Source: `.opencode/skills/<slug>/` (promoted location)
- Destination: `.matrixx/evolution/quarantine/<slug>/`
- Uses atomic rename with cp+rm fallback
- Audit log records `action: "quarantined"`

If a quarantined skill is later re-evaluated and passes the quality gate, `restoreFromQuarantine(slug)` moves it back to the promoted directory. This avoids losing work that may become relevant as the project evolves.

## Superseded-By Lifecycle

When a re-distillation produces different content for the same knowledge key (projectId + kind + normalized title), the writer does **not** bump a version number. Instead:

1. `findLiveHead` locates the newest artifact for that key without `superseded_by`
2. If the content hash differs from the candidate, a **new** artifact is emitted under a distinct slug (`chainSlug(baseSlug, contentHash)`)
3. The old artifact's `meta.json` gets `superseded_by` pointing to the new slug
4. Both old and new files remain on disk (immutable history)
5. Byte-identical re-distills are idempotent: `deduped: true`, audit `dedup-suppressed`, zero extra files

`resolveHeadSlug(metas, startSlug)` follows the `superseded_by` chain (cycle-safe via seen-set) to find the current live artifact. `promote(slug)` resolves the live head first, falling back to the requested slug if the head file is absent.

This replaces the earlier version-bump approach. Old artifacts keep their files for audit trail but are never served to retrieval or promotion.

## Retrieval, Read-Only Query Actions

The `evolution` tool exposes two read-only retrieval actions that query approved knowledge without mutating state.

### search

Returns a list of matching knowledge records (up to `SEARCH_RESULT_LIMIT = 20`). Filters by:

- `isRetrievable` predicate: status must be `"approved"`, not quarantined, not superseded, project scope match, optional kind filter
- Case-insensitive substring match against id + body text (when `query` is provided)

### get_context

Returns the full text of matching records, truncated at `GET_CONTEXT_CHAR_CAP = 4000` characters. When truncation occurs, `\n...[context truncated]` is appended. Uses the same `isRetrievable` predicate and scope filtering as `search`.

### Scope Resolution

Both actions resolve the caller's project identity via `resolveProjectIdentity(process.cwd())`. The scope includes:

- `projectId`: the caller's resolved project ID
- `kinds`: optional filter from the `kind` argument

Skills from other projects (different `projectId`) or the `"unscoped-legacy"` sentinel are excluded from results when a specific project scope is active.

### Data Sources

Retrieval reads from two locations:

1. `.matrixx/evolution/skills/<slug>/` (staged/promoted, body from `SKILL.md`)
2. `.matrixx/evolution/pending/<slug>.meta.json` (pending proposals)

Staged entries win on slug collisions.

## Provenance Frontmatter

Every generated `SKILL.md` includes YAML frontmatter with full provenance. The `writer-frontmatter.ts` module emits these fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Slug name |
| `version` | string | Version identifier |
| `derived_from` | string[] | Source session IDs |
| `session_ids` | string[] | Same as `derived_from` |
| `trace_ids` | string[] | Source trace IDs (`sourceTraceIDs`) |
| `project_id` | string | Project identity hash (or `"unscoped-legacy"`) |
| `kind` | string | Knowledge kind (`workflow`/`correction`/`debugging_pattern`/`gotcha`/`convention`) |
| `confidence` | number | Quality gate confidence score |
| `distilled_at` | string | ISO 8601 timestamp of distillation |
| `eval_score` | number \| null | Post-promotion evaluation score |
| `tags` | string[] | Optional tags |
| `prerequisites` | string[] | Optional prerequisites |

All string scalars are JSON-quoted so js-yaml keeps ISO timestamps as strings. The `meta.json` mirrors all provenance keys. `readMeta()` warns (but does not throw) when provenance is missing on legacy artifacts.

## Config

Enable in `matrixx.json` / `matrixx.jsonc`:

```jsonc
{
  "evolution": {
    "enabled": false,
    "watcher": { "maxArgChars": 4000, "maxOutputChars": 8000, "skipTools": ["evolution-watcher", "evolution-compressor"] },
    "compressor": { "provider": "llm", "minTraces": 5, "maxInputTokens": 32000, "trigger": "both" },
    "writer": { "outputDir": ".matrixx/evolution/skills", "globalSkills": false },
    "governance": { "requireApproval": true, "autoPromote": false, "autoPromoteThreshold": 0.85, "minConfidence": 0.7 },
    "retention": { "traceDays": 30, "maxPending": 50 },
    "budget": { "maxCompressionsPerHour": 10, "maxCostCentsPerDay": 100 }
  }
}
```

Source of truth: `src/config/schema/evolution.ts`.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `enabled` | `boolean` | `false` | Opt-in kill switch |
| `watcher.maxArgChars` | `number` | `4000` | Truncation for `args` |
| `watcher.maxOutputChars` | `number` | `8000` | Truncation for `output` |
| `watcher.skipTools` | `string[]` | `["evolution-watcher","evolution-compressor"]` | Recursion guard |
| `compressor.provider` | `"llm" \| "dspy-gepa"` | `"llm"` | `dspy-gepa` adapter placeholder |
| `compressor.model` | `string?` | main model | Override compressor model |
| `compressor.minTraces` | `number` | `5` | Skip compression below threshold |
| `compressor.maxInputTokens` | `number` | `32000` | Prompt truncation cap |
| `compressor.trigger` | `"compacting"\|"idle"\|"both"` | `"both"` | Which events fire compressor |
| `writer.outputDir` | `string` | `".matrixx/evolution/skills"` | Staged skills dir |
| `writer.globalSkills` | `boolean` | `false` | Also write to `~/.agents/skills/` |
| `writer.allowToolGeneration` | `boolean` | `false` | Gated |
| `writer.allowAgentGeneration` | `boolean` | `false` | Gated |
| `governance.requireApproval` | `boolean` | `true` | HITL required |
| `governance.autoPromote` | `boolean` | `false` | Silent promote if eligible |
| `governance.autoPromoteThreshold` | `number` | `0.85` | Min confidence for auto-promote |
| `governance.minConfidence` | `number` | `0.7` | Min confidence to stage |
| `retention.traceDays` | `number` | `30` | `TraceStore.cleanup()` on idle |
| `retention.maxPending` | `number` | `50` | Cap pending proposals |
| `budget.maxCompressionsPerHour` | `number` | `10` | Throttle via `state.lastCompressionAt` |
| `budget.maxCostCentsPerDay` | `number` | `100` | Daily cost cap (enforced, not reserved) |

Regenerate schemas after schema edits: `bun run build:schema` produces `dist/matrixx.schema.json` + `assets/matrixx.schema.json`.

## Triggers

| Trigger | Hook | Action |
|---------|------|--------|
| `tool.execute.after` | `evolution-watcher` | `traceStore.append` (truncated args/output, `classifySuccess`, recursion guard) |
| `experimental.session.compacting` | `evolution-compressor` | Primary: context about to be lost |
| `session.idle` | `evolution-compressor` | Opportunistic if `traces >= minTraces` |
| `session.error` | `evolution-compressor` | Failure trajectory capture |

## Quality Gate

Runs inline in the pipeline before `writer.stage` (`passesQualityGate` in `src/hooks/evolution-quality-gate`, invoked by `src/features/evolution/pipeline.ts`):

- `confidence >= governance.minConfidence` (default 0.7) -- otherwise discarded
- `skillDraft` non-empty
- Secret scan -- reuses `containsSecretForEval` patterns; blocks `sk-`, `api_key`, etc.
- Markdown parses (frontmatter `name`, `version`, `derived_from`, `created_at`, `confidence`)

## HITL

When `requireApproval=true` and quality gate passes, the writer stages `.matrixx/evolution/pending/<slug>.md`. The user interacts via the `evolution` tool:

| Action | Effect |
|--------|--------|
| `list` | Show pending proposals with version and confidence |
| `get` | Show a staged proposal's details |
| `approve` | Promote a pending skill to `.opencode/skills/<slug>/SKILL.md` |
| `reject` | Discard a pending proposal |
| `status` | State totals, pending count, and audit tail |
| `search` | Read-only scoped search over approved knowledge |
| `get_context` | Read-only scoped context with 4000-char cap |

Auto-promote path: if `autoPromote=true` and `confidence >= autoPromoteThreshold` and gate passes, promote silently without HITL.

## Audit

Audit trail in `.matrixx/evolution/audit.log` (JSONL). Recorded actions:

| Action | When |
|--------|------|
| `staged` | Artifact written to pending |
| `promoted` | Skill promoted to `.opencode/skills/` |
| `rejected` | Pending proposal discarded |
| `compressed` | Compression completed |
| `skipped` | Compression skipped (throttle/minTraces) |
| `gate-rejected` | Quality gate failed |
| `max-pending` | Pending queue full |
| `pipeline-error` | Pipeline caught an error |
| `quarantined` | Low-eval skill moved to quarantine |
| `superseded` | Old artifact pointed to new live head |
| `dedup-suppressed` | Byte-identical re-distill suppressed |

## Safety

| Risk | Mitigation |
|------|------------|
| Infinite recursion | `watcher.skipTools` + `evolution-*` session tag guard |
| Cost explosion | `budget.maxCostCentsPerDay` (daily cap), `budget.maxCompressionsPerHour` (hourly throttle), `compressor.minTraces`, `maxInputTokens` truncation |
| Pending queue bloat | `retention.maxPending` (50 default), `MaxPendingError` thrown and caught |
| Bad skill quality | Quality gate + `minConfidence` + human approval default |
| Secret leak | `containsSecretForEval` scan on `skillDraft` before write |
| Trace durability | JSONL append + periodic flush; survives crashes |
| Cross-project collision | Scoped dedup via `projectSlugSuffix` |
| Surprise activation | `enabled: false` opt-in |
