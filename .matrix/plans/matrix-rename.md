# Matrix-Themed Agent, Team & Category Rename

## TL;DR

> **Quick Summary**: Rename all 11 agents, 4 team groups, and 8 delegation categories from Greek Mythology to The Matrix universe theme. Includes file/directory renames, conceptual terminology changes (boulder→mission, bouldering→jacking-in, Ralph Loop→Matrix Loop), `.sisyphus/`→`.matrix/` directory rename, and documentation updates.
> 
> **Deliverables**:
> - All 11 agents renamed (Sisyphus→Morpheus, Atlas→Architect, etc.)
> - All file/directory names updated to match
> - `.sisyphus/` directory → `.matrix/`
> - boulder.json → mission.json, bouldering → jacking-in
> - Ralph Loop → Matrix Loop
> - All 8 delegation categories renamed
> - All AGENTS.md files updated
> - README updated
> - All 176 tests passing
> 
> **Estimated Effort**: XL (100+ files touched)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (baseline) → Task 2 (types/schema) → Tasks 3-7 (agents, parallel) → Task 8 (categories) → Task 9 (terminology) → Task 10 (docs) → Task 11 (verification)

---

## Context

### Original Request
User wants to change all agent names and team names from Greek Mythology to The Matrix universe theme. Deep lore coherence matters — each name must meaningfully map to its role.

### Interview Summary
**Key Discussions**:
- Theme: The Matrix (Wachowski canon) — chosen over Norse, Alchemy, Neural Network, Unix alternatives
- Scope: Full rename — agents, teams, categories, files, directories, terminology, documentation
- File renames: YES — sisyphus.ts → morpheus.ts, etc.
- `.sisyphus/` → `.matrix/`
- Bouldering/Ralph Loop terminology: YES — rename to Matrix equivalents
- README/docs: YES — update to Matrix theme

**Research Findings**:
- Agent names scattered across 5 layers: types, config schema, prompts, delegation logic, tests
- Names NOT centralized — requires global search-and-replace
- `.sisyphus` appears in 51 files, `boulder` in 24 files, `ralph` in 30 files
- 172 boulder references, 166 ralph references, 275 `.sisyphus` references

### Metis Review
**Identified Gaps** (addressed):
- Name collision risk (Oracle, Smith, Mouse are common words) → Use targeted, context-aware replacements
- LSP rename for TypeScript identifiers → Mandatory for type-safe refactoring
- Schema regeneration after Zod changes → `bun run build:schema` included
- Case variation handling → All case variants accounted for

---

## Work Objectives

### Core Objective
Rename all Greek Mythology references to The Matrix universe, maintaining full thematic coherence, while preserving all existing functionality and passing the complete test suite.

### Name Mapping (Complete Reference)

**Agents:**

| Current | New | Role |
|---|---|---|
| Sisyphus | Morpheus | Primary orchestrator |
| Atlas | Architect | Master orchestrator |
| Prometheus | Oracle | Strategic planner |
| Metis | Seraph | Pre-planning analyst |
| Momus | Smith | Plan validator |
| Hephaestus | Keymaker | Autonomous deep worker |
| Sisyphus-Junior | Mouse | Delegated executor |
| Oracle (current) | Merovingian | Strategic advisor |
| Librarian | Operator | Docs & research |
| Explore | Trinity | Fast codebase search |
| Multimodal-Looker | Construct | Visual analyzer |

**Teams:**

| Current | New |
|---|---|
| Orchestrators | The Bridge |
| Planning Family | The Prophecy |
| Specialists | The Crew |
| Exploration | The Operators |

**Categories:**

| Current | New |
|---|---|
| visual-engineering | construct |
| ultrabrain | source |
| deep | deep-jack |
| artistry | matrix-bend |
| quick | bullet-time |
| unspecified-low | blue-pill |
| unspecified-high | red-pill |
| writing | broadcast |

**Terminology:**

| Current | New |
|---|---|
| boulder | mission |
| boulder.json | mission.json |
| bouldering | jacking-in |
| boulder state | mission state |
| BoulderState | MissionState |
| boulder-state (directory) | mission-state |
| Ralph Loop | Matrix Loop |
| ralph-loop | matrix-loop |
| RalphLoop | MatrixLoop |
| cancel-ralph | cancel-loop |
| .sisyphus/ | .matrix/ |

**File Renames:**

| Current Path | New Path |
|---|---|
| `src/agents/sisyphus.ts` | `src/agents/morpheus.ts` |
| `src/agents/sisyphus-junior/` | `src/agents/mouse/` |
| `src/agents/atlas/` | `src/agents/architect/` |
| `src/agents/prometheus/` | `src/agents/oracle-planner/` |
| `src/agents/hephaestus.ts` | `src/agents/keymaker.ts` |
| `src/agents/oracle.ts` | `src/agents/merovingian.ts` |
| `src/agents/librarian.ts` | `src/agents/operator.ts` |
| `src/agents/explore.ts` | `src/agents/trinity.ts` |
| `src/agents/multimodal-looker.ts` | `src/agents/construct.ts` |
| `src/agents/metis.ts` | `src/agents/seraph.ts` |
| `src/agents/momus.ts` | `src/agents/smith.ts` |
| `src/agents/momus.test.ts` | `src/agents/smith.test.ts` |
| `src/agents/builtin-agents/sisyphus-agent.ts` | `src/agents/builtin-agents/morpheus-agent.ts` |
| `src/agents/builtin-agents/hephaestus-agent.ts` | `src/agents/builtin-agents/keymaker-agent.ts` |
| `src/agents/builtin-agents/atlas-agent.ts` | `src/agents/builtin-agents/architect-agent.ts` |
| `src/agents/prometheus-prompt.test.ts` | `src/agents/oracle-planner-prompt.test.ts` |
| `src/hooks/ralph-loop/` | `src/hooks/matrix-loop/` |
| `src/hooks/ralph-loop/ralph-loop-hook.ts` | `src/hooks/matrix-loop/matrix-loop-hook.ts` |
| `src/hooks/ralph-loop/ralph-loop-event-handler.ts` | `src/hooks/matrix-loop/matrix-loop-event-handler.ts` |
| `src/hooks/prometheus-md-only/` | `src/hooks/oracle-planner-md-only/` |
| `src/hooks/sisyphus-junior-notepad/` | `src/hooks/mouse-notepad/` |
| `src/hooks/atlas/` | `src/hooks/architect/` |
| `src/features/boulder-state/` | `src/features/mission-state/` |
| `src/features/builtin-commands/templates/ralph-loop.ts` | `src/features/builtin-commands/templates/matrix-loop.ts` |
| `src/config/schema/ralph-loop.ts` | `src/config/schema/matrix-loop.ts` |

> **NOTE on `src/agents/prometheus/` → `src/agents/oracle-planner/`**: We use `oracle-planner` (not just `oracle`) because the current agent named "Oracle" maps to "Merovingian." Using `oracle-planner` avoids ambiguity between the Prometheus→Oracle rename and the Oracle→Merovingian rename.

### Concrete Deliverables
- All TypeScript types, interfaces, and schemas updated
- All agent prompt files updated with new identities
- All file names and directory names renamed
- All import paths updated
- All test files updated and passing
- JSON schema regenerated via `bun run build:schema`
- Documentation updated (AGENTS.md files, README)

### Definition of Done
- [ ] `bun test` passes (all 176 test files)
- [ ] `bun run typecheck` passes
- [ ] `bun run build` succeeds
- [ ] `grep -r "Sisyphus\|Atlas\|Prometheus\|Hephaestus\|Metis\|Momus\|Librarian\|multimodal-looker" src/ --include="*.ts"` returns zero results (excluding legitimate Matrix references like "The Architect")
- [ ] `grep -r "\.sisyphus" src/ --include="*.ts"` returns zero results
- [ ] `grep -r "boulder" src/ --include="*.ts"` returns zero results
- [ ] `grep -r "ralph" src/ --include="*.ts"` returns zero results (case-insensitive)

### Must Have
- Every agent identity string in prompts updated ("You are Morpheus", not "You are Sisyphus")
- All 176 test files passing
- TypeScript compilation succeeds
- Build succeeds
- No orphaned imports or references

### Must NOT Have (Guardrails)
- NO code logic changes — this is a rename-only refactoring
- NO functional behavior changes
- NO new features or refactoring beyond the rename
- NO blind find-replace of common words (Oracle, Smith, Mouse) — context-aware replacement only
- NO touching third-party dependencies or node_modules
- NO renaming the npm package name "oh-my-opencode"
- NO changing model assignments or temperature values
- NO touching the `packages/` directory (platform-specific binaries)

---

## Verification Strategy (MANDATORY)

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (tests-after — run existing tests to verify nothing breaks)
- **Framework**: bun test (176 test files)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

Every task includes verification commands that the executing agent runs directly.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| TypeScript types | Bash (`bun run typecheck`) | Compile, zero errors |
| Test suite | Bash (`bun test`) | All 176 files pass |
| String removal | Bash (`grep`) | Zero matches for old names |
| Build output | Bash (`bun run build`) | Clean build |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: Establish test baseline

Wave 2 (After Wave 1):
└── Task 2: Core types, schemas, and .matrix/ directory rename (FOUNDATION)

Wave 3 (After Wave 2 — PARALLEL):
├── Task 3: Rename Morpheus + Mouse (Sisyphus family)
├── Task 4: Rename Architect (Atlas)
├── Task 5: Rename Oracle-Planner + Seraph + Smith (Planning family: Prometheus, Metis, Momus)
├── Task 6: Rename Keymaker (Hephaestus)
└── Task 7: Rename Merovingian, Operator, Trinity, Construct (Advisors + Exploration)

Wave 4 (After Wave 3):
├── Task 8: Rename delegation categories + team names
├── Task 9: Rename terminology (boulder→mission, Ralph→Matrix Loop)
├── Task 10: Update documentation (AGENTS.md files, README)
└── Task 11: Final verification + schema rebuild
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2 | None |
| 2 | 1 | 3,4,5,6,7 | None |
| 3 | 2 | 8,9 | 4,5,6,7 |
| 4 | 2 | 8,9 | 3,5,6,7 |
| 5 | 2 | 8,9 | 3,4,6,7 |
| 6 | 2 | 8,9 | 3,4,5,7 |
| 7 | 2 | 8,9 | 3,4,5,6 |
| 8 | 3,4,5,6,7 | 11 | 9,10 |
| 9 | 3,4,5,6,7 | 11 | 8,10 |
| 10 | 3,4,5,6,7 | 11 | 8,9 |
| 11 | 8,9,10 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1 | task(category="quick", load_skills=["git-master"]) |
| 2 | 2 | task(category="unspecified-high", load_skills=["git-master"]) |
| 3 | 3,4,5,6,7 | task(category="unspecified-low", load_skills=["git-master"]) × 5 parallel |
| 4 | 8,9,10 | task(category="unspecified-low", load_skills=["git-master"]) × 3 parallel |
| final | 11 | task(category="quick", load_skills=["git-master"]) |

---

## TODOs

- [x] 1. Establish Test Baseline

  **What to do**:
  - Run `bun test` and capture output — all 176 test files must pass
  - Run `bun run typecheck` — must pass
  - Run `bun run build` — must succeed
  - Record baseline results for comparison

  **Must NOT do**:
  - Do NOT modify any files
  - Do NOT fix any pre-existing test failures (report them if found)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple command execution, no code changes
  - **Skills**: [`git-master`]
    - `git-master`: For clean baseline commit tagging if needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `package.json` — Contains test/build/typecheck scripts

  **Acceptance Criteria**:

  ```
  Scenario: Test baseline is clean
    Tool: Bash
    Preconditions: Project dependencies installed
    Steps:
      1. bun test → Assert: 0 failures
      2. bun run typecheck → Assert: exit code 0
      3. bun run build → Assert: exit code 0
    Expected Result: All green
    Evidence: Terminal output captured
  ```

  **Commit**: NO

---

- [ ] 2. Core Types, Schema, and `.matrix/` Directory Rename (FOUNDATION)

  **What to do**:
  - **Step 1 — Directory rename**: Rename `.sisyphus/` directory constant to `.matrix/` across the codebase
    - `src/features/boulder-state/constants.ts`: Change `BOULDER_DIR = ".sisyphus"` → `MISSION_DIR = ".matrix"` and `PROMETHEUS_PLANS_DIR = ".sisyphus/plans"` → `ORACLE_PLANS_DIR = ".matrix/plans"`
    - `src/hooks/ralph-loop/constants.ts`: Change `DEFAULT_STATE_FILE = ".sisyphus/ralph-loop.local.md"` → will be handled in Task 9
    - All prompt files referencing `.sisyphus/` paths → `.matrix/` (approximately 275 references across 51 files)
    - `src/hooks/prometheus-md-only/constants.ts`: `ALLOWED_PATH_PREFIX = ".sisyphus"` → `ALLOWED_PATH_PREFIX = ".matrix"`
    - `src/hooks/prometheus-md-only/path-policy.ts`: Update regex `\.sisyphus[/\\]` → `\.matrix[/\\]`
    - `src/hooks/atlas/sisyphus-path.ts`: Rename file and update regex
    - `src/hooks/write-existing-file-guard/hook.ts`: Update `.sisyphus` reference
    - `src/hooks/rules-injector/constants.ts`: Update `[".sisyphus", "rules"]` → `[".matrix", "rules"]`
  - **Step 2 — Agent name types**: Update `src/agents/types.ts` — rename all agent name strings in the type union
  - **Step 3 — Config schema**: Update `src/config/schema/agent-names.ts` — rename all agent name constants
  - **Step 4 — Agent overrides schema**: Update `src/config/schema/agent-overrides.ts` — rename config keys
  - **Step 5 — Run `bun run build:schema`** to regenerate the JSON schema
  - **Step 6 — Update all import paths** that reference `.sisyphus` as a string

  **Must NOT do**:
  - Do NOT rename agent files yet (that's Tasks 3-7)
  - Do NOT change any agent prompts yet
  - Do NOT rename ralph-loop or boulder terminology yet (Task 9)
  - Do NOT change functional logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches many files across the entire codebase, requires careful coordination
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commits after each logical step

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo — foundational)
  - **Blocks**: Tasks 3, 4, 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/agents/types.ts` — Agent name type union (the source of truth for agent names)
  - `src/config/schema/agent-names.ts` — Agent name constants for configuration
  - `src/config/schema/agent-overrides.ts` — Config override keys per agent

  **API/Type References**:
  - `src/features/boulder-state/constants.ts` — BOULDER_DIR and PROMETHEUS_PLANS_DIR constants
  - `src/hooks/prometheus-md-only/constants.ts:10` — ALLOWED_PATH_PREFIX
  - `src/hooks/prometheus-md-only/path-policy.ts:28` — `.sisyphus` regex check
  - `src/hooks/atlas/sisyphus-path.ts` — `.sisyphus` path checker function
  - `src/hooks/write-existing-file-guard/hook.ts:29` — `.sisyphus` root path
  - `src/hooks/rules-injector/constants.ts:20` — Rules path array

  **Acceptance Criteria**:

  ```
  Scenario: Agent name types updated
    Tool: Bash
    Steps:
      1. grep "sisyphus\|atlas\|prometheus\|hephaestus\|metis\|momus\|librarian\|explore\|multimodal-looker" src/agents/types.ts
      2. Assert: zero matches (only new Matrix names should exist)
      3. grep "morpheus\|architect\|oracle\|seraph\|smith\|keymaker\|mouse\|merovingian\|operator\|trinity\|construct" src/agents/types.ts
      4. Assert: all 11 new names present
    Expected Result: Type definitions use Matrix names only

  Scenario: .matrix directory constant
    Tool: Bash
    Steps:
      1. grep "\.sisyphus" src/features/boulder-state/constants.ts → Assert: zero matches
      2. grep "\.matrix" src/features/boulder-state/constants.ts → Assert: matches present
    Expected Result: Directory constant updated

  Scenario: Schema builds cleanly
    Tool: Bash
    Steps:
      1. bun run build:schema → Assert: exit code 0
      2. bun run typecheck → Assert: exit code 0
    Expected Result: Schema regenerated with new names
  ```

  **Commit**: YES
  - Message: `refactor(core): rename agent types and .sisyphus→.matrix directory references`
  - Files: `src/agents/types.ts`, `src/config/schema/agent-names.ts`, `src/config/schema/agent-overrides.ts`, `src/features/boulder-state/constants.ts`, `src/hooks/prometheus-md-only/`, `src/hooks/write-existing-file-guard/`, `src/hooks/rules-injector/`, `src/hooks/atlas/sisyphus-path.ts`
  - Pre-commit: `bun run typecheck`

---

- [ ] 3. Rename Sisyphus → Morpheus and Sisyphus-Junior → Mouse

  **What to do**:
  - **File renames**:
    - `src/agents/sisyphus.ts` → `src/agents/morpheus.ts`
    - `src/agents/sisyphus-junior/` → `src/agents/mouse/` (entire directory)
    - `src/agents/builtin-agents/sisyphus-agent.ts` → `src/agents/builtin-agents/morpheus-agent.ts`
  - **Identity strings in prompts**: Update all "You are Sisyphus" → "You are Morpheus" in `src/agents/morpheus.ts` (formerly sisyphus.ts)
  - **Identity strings in prompts**: Update "Why Sisyphus?" section to "Why Morpheus?" with Matrix lore
  - **Factory function names**: `createSisyphusAgent` → `createMorpheusAgent`, `createSisyphusJuniorAgent` → `createMouseAgent`
  - **Metadata constants**: `SISYPHUS_PROMPT_METADATA` → `MORPHEUS_PROMPT_METADATA`, same for Junior
  - **Config references**: `sisyphus_agent` config key → `morpheus_agent` across config schema, plugin handlers, CLI
  - **Import updates**: All files importing from sisyphus.ts or sisyphus-junior/
  - **Test updates**: `src/agents/utils.test.ts` — all `agents.sisyphus` references → `agents.morpheus`
  - **Hook references**: `src/hooks/sisyphus-junior-notepad/` → `src/hooks/mouse-notepad/` (directory rename)
  - **Plugin handlers**: `src/plugin-handlers/agent-config-handler.ts` — `isSisyphusEnabled` → `isMorpheusEnabled`, all sisyphus config key references
  - **CLI**: `src/cli/run/agent-resolver.ts` — `"sisyphus"` string check
  - **Other hooks**: References to "sisyphus" in `src/hooks/atlas/event-handler.ts`, `src/plugin/hooks/create-session-hooks.ts`

  **Must NOT do**:
  - Do NOT change any other agent names in this task
  - Do NOT change boulder/ralph terminology (Task 9)
  - Do NOT change delegation category logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Scoped to Sisyphus family files, moderate effort
  - **Skills**: [`git-master`]
    - `git-master`: File renames with git mv for history preservation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/agents/sisyphus.ts` — Main Sisyphus agent definition (530 lines), identity prompt
  - `src/agents/sisyphus-junior/agent.ts` — Junior agent factory
  - `src/agents/sisyphus-junior/default.ts` — Claude-optimized prompt
  - `src/agents/sisyphus-junior/gpt.ts` — GPT-optimized prompt
  - `src/agents/builtin-agents/sisyphus-agent.ts` — Sisyphus registration and config resolution

  **API/Type References**:
  - `src/plugin-handlers/agent-config-handler.ts:90-103` — `isSisyphusEnabled`, `sisyphus_agent` config access
  - `src/plugin-handlers/tool-config-handler.ts:49` — `params.agentResult.sisyphus`
  - `src/plugin/hooks/create-session-hooks.ts:106` — `isSisyphusEnabled`
  - `src/plugin/tool-execute-before.ts:30` — `sisyphusJuniorNotepad` reference
  - `src/cli/run/agent-resolver.ts:21` — `"sisyphus"` string comparison
  - `src/cli/fallback-chain-resolution.ts:28` — `AGENT_MODEL_REQUIREMENTS.sisyphus`

  **Test References**:
  - `src/agents/utils.test.ts` — 40+ references to `agents.sisyphus`
  - `src/agents/sisyphus-junior/index.test.ts` — Junior agent tests
  - `src/plugin-handlers/config-handler.test.ts` — `agentResult.sisyphus`
  - `src/shared/migration.test.ts` — `sisyphus` migration references
  - `src/shared/agent-config-integration.test.ts` — `result.migrated.sisyphus`
  - `src/cli/model-fallback.test.ts` — `result.agents?.sisyphus`
  - `src/cli/config-manager.test.ts` — `result.agents.sisyphus`

  **Config References**:
  - `src/config/schema/oh-my-opencode-config.ts` — `sisyphus_agent` field
  - `src/features/claude-tasks/storage.ts` — `config.sisyphus` reference

  **Acceptance Criteria**:

  ```
  Scenario: Sisyphus fully renamed to Morpheus
    Tool: Bash
    Steps:
      1. grep -ri "sisyphus" src/agents/ --include="*.ts" → Assert: zero matches
      2. grep -ri "sisyphus" src/plugin-handlers/ --include="*.ts" → Assert: zero matches
      3. grep -ri "sisyphus" src/cli/ --include="*.ts" → Assert: zero matches (excluding legitimate references to other agents' prompts mentioning Morpheus)
      4. ls src/agents/morpheus.ts → Assert: file exists
      5. ls src/agents/mouse/ → Assert: directory exists
      6. bun run typecheck → Assert: exit code 0
    Expected Result: All Sisyphus references replaced with Morpheus
  ```

  **Commit**: YES
  - Message: `refactor(agents): rename Sisyphus→Morpheus and Sisyphus-Junior→Mouse`
  - Pre-commit: `bun run typecheck`

---

- [ ] 4. Rename Atlas → Architect

  **What to do**:
  - **Directory rename**: `src/agents/atlas/` → `src/agents/architect/`
  - **File rename**: `src/agents/builtin-agents/atlas-agent.ts` → `src/agents/builtin-agents/architect-agent.ts`
  - **Hook directory rename**: `src/hooks/atlas/` → `src/hooks/architect/`
  - **Identity strings**: Update all "Atlas" identity references in prompts (`src/agents/architect/default.ts`, `src/agents/architect/gpt.ts`)
  - **Factory functions**: `createAtlasAgent` → `createArchitectAgent`
  - **Metadata**: `ATLAS_PROMPT_METADATA` → `ARCHITECT_PROMPT_METADATA`
  - **Import updates**: All files importing from atlas/ paths
  - **Test updates**: `src/hooks/atlas/index.test.ts` (moves to `src/hooks/architect/index.test.ts`)

  **Must NOT do**:
  - Do NOT change any other agent names
  - Do NOT change delegation categories

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Scoped to Atlas directory and hook, moderate effort
  - **Skills**: [`git-master`]
    - `git-master`: Directory renames with history preservation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 5, 6, 7)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/agents/atlas/agent.ts` — Atlas factory function and triggers
  - `src/agents/atlas/default.ts` — Claude-optimized Atlas prompt (355+ lines)
  - `src/agents/atlas/gpt.ts` — GPT-optimized Atlas prompt (313+ lines)
  - `src/agents/atlas/prompt-section-builder.ts` — Prompt assembly
  - `src/agents/builtin-agents/atlas-agent.ts` — Atlas registration

  **API/Type References**:
  - `src/hooks/atlas/event-handler.ts` — `"atlas"` string comparisons for boulder agent
  - `src/hooks/atlas/tool-execute-after.ts` — Atlas-specific output transformation
  - `src/hooks/atlas/boulder-continuation-injector.ts` — Boulder continuation
  - `src/hooks/atlas/verification-reminders.ts` — Plan verification
  - `src/hooks/atlas/system-reminder-templates.ts` — Atlas identity in reminders
  - `src/hooks/atlas/sisyphus-path.ts` — `.sisyphus` path checker (rename function too)

  **Test References**:
  - `src/hooks/atlas/index.test.ts` — Extensive Atlas hook tests (1000+ lines)

  **Acceptance Criteria**:

  ```
  Scenario: Atlas fully renamed to Architect
    Tool: Bash
    Steps:
      1. grep -ri "atlas" src/agents/ --include="*.ts" → Assert: zero matches
      2. grep -ri "atlas" src/hooks/architect/ --include="*.ts" → Assert: zero matches (only "Architect" references)
      3. ls src/agents/architect/agent.ts → Assert: exists
      4. ls src/hooks/architect/ → Assert: directory exists
      5. bun run typecheck → Assert: exit code 0
    Expected Result: All Atlas references replaced with Architect
  ```

  **Commit**: YES
  - Message: `refactor(agents): rename Atlas→Architect`
  - Pre-commit: `bun run typecheck`

---

- [ ] 5. Rename Prometheus → Oracle (Planner), Metis → Seraph, Momus → Smith

  **What to do**:
  - **Prometheus**:
    - Directory rename: `src/agents/prometheus/` → `src/agents/oracle-planner/`
    - Hook rename: `src/hooks/prometheus-md-only/` → `src/hooks/oracle-planner-md-only/`
    - Test rename: `src/agents/prometheus-prompt.test.ts` → `src/agents/oracle-planner-prompt.test.ts`
    - Identity strings: "You are Prometheus" → "You are Oracle" in all prompt files
    - Factory: `createPrometheusAgent` → `createOraclePlannerAgent`
    - All `.sisyphus/` references in Prometheus prompts already handled in Task 2, but verify
  - **Metis**:
    - File rename: `src/agents/metis.ts` → `src/agents/seraph.ts`
    - Identity strings: "Metis" → "Seraph" in prompts
    - Factory: `createMetisAgent` → `createSeraphAgent`
    - References in plan-generation.ts where Metis is summoned
  - **Momus**:
    - File rename: `src/agents/momus.ts` → `src/agents/smith.ts`
    - Test rename: `src/agents/momus.test.ts` → `src/agents/smith.test.ts`
    - Identity strings: "Momus" → "Smith" in prompts
    - Factory: `createMomusAgent` → `createSmithAgent`
    - References in high-accuracy-mode.ts where Momus is invoked
    - **CAUTION**: "Smith" is a common word — use context-aware replacement, not blind find-replace. Only replace in agent-identity context.

  **Must NOT do**:
  - Do NOT rename the current "Oracle" agent here (that's Task 7 — Oracle→Merovingian)
  - Do NOT use blind find-replace for "Smith" — only replace in agent-name context

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Three related agents in the planning family, moderate effort
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commits per agent rename

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 6, 7)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/agents/prometheus/` — 8 files: system-prompt.ts, plan-template.ts, interview-mode.ts, plan-generation.ts, high-accuracy-mode.ts, identity-constraints.ts, behavioral-summary.ts, index.ts
  - `src/agents/metis.ts` — Metis agent definition (347 lines)
  - `src/agents/momus.ts` — Momus agent definition (244 lines)
  - `src/hooks/prometheus-md-only/` — Hook enforcing planner write restrictions

  **API/Type References**:
  - `src/agents/prometheus/plan-generation.ts:30` — `.sisyphus/plans/{name}.md` (verify Task 2 handled)
  - `src/agents/prometheus/identity-constraints.ts` — Prometheus identity rules
  - `src/agents/prometheus/high-accuracy-mode.ts:21` — Momus invocation prompt

  **Test References**:
  - `src/agents/prometheus-prompt.test.ts` — Prometheus prompt tests
  - `src/agents/momus.test.ts` — Momus extraction tests
  - `src/hooks/prometheus-md-only/index.test.ts` — MD-only hook tests (extensive)

  **Acceptance Criteria**:

  ```
  Scenario: Planning family fully renamed
    Tool: Bash
    Steps:
      1. grep -ri "prometheus" src/agents/ --include="*.ts" → Assert: zero matches
      2. grep -ri "\bmetis\b" src/agents/ --include="*.ts" → Assert: zero matches
      3. grep -ri "\bmomus\b" src/agents/ --include="*.ts" → Assert: zero matches
      4. ls src/agents/oracle-planner/index.ts → Assert: exists
      5. ls src/agents/seraph.ts → Assert: exists
      6. ls src/agents/smith.ts → Assert: exists
      7. bun run typecheck → Assert: exit code 0
    Expected Result: All planning family agents renamed
  ```

  **Commit**: YES
  - Message: `refactor(agents): rename Prometheus→Oracle, Metis→Seraph, Momus→Smith`
  - Pre-commit: `bun run typecheck`

---

- [ ] 6. Rename Hephaestus → Keymaker

  **What to do**:
  - **File renames**:
    - `src/agents/hephaestus.ts` → `src/agents/keymaker.ts`
    - `src/agents/builtin-agents/hephaestus-agent.ts` → `src/agents/builtin-agents/keymaker-agent.ts`
  - **Identity strings**: "You are Hephaestus" → "You are Keymaker" in prompt
  - **Lore update**: Replace Hephaestus mythology references with Keymaker Matrix lore ("The Keymaker works alone, crafting keys that open doors nobody else can...")
  - **Factory**: `createHephaestusAgent` → `createKeymakerAgent`
  - **Metadata**: `HEPHAESTUS_PROMPT_METADATA` → `KEYMAKER_PROMPT_METADATA`
  - **Import updates**: All files importing from hephaestus.ts

  **Must NOT do**:
  - Do NOT change any other agent files
  - Do NOT modify delegation logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Single agent, contained scope
  - **Skills**: [`git-master`]
    - `git-master`: File rename with history

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 5, 7)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/agents/hephaestus.ts` — Hephaestus agent definition (624 lines)
  - `src/agents/builtin-agents/hephaestus-agent.ts` — Registration and config

  **Acceptance Criteria**:

  ```
  Scenario: Hephaestus fully renamed to Keymaker
    Tool: Bash
    Steps:
      1. grep -ri "hephaestus" src/ --include="*.ts" → Assert: zero matches
      2. ls src/agents/keymaker.ts → Assert: exists
      3. bun run typecheck → Assert: exit code 0
    Expected Result: All Hephaestus references replaced
  ```

  **Commit**: YES
  - Message: `refactor(agents): rename Hephaestus→Keymaker`
  - Pre-commit: `bun run typecheck`

---

- [ ] 7. Rename Oracle → Merovingian, Librarian → Operator, Explore → Trinity, Multimodal-Looker → Construct

  **What to do**:
  - **Oracle → Merovingian**:
    - File rename: `src/agents/oracle.ts` → `src/agents/merovingian.ts`
    - Identity: "oracle" → "merovingian" in prompts, type unions, delegation strings
    - Factory: `createOracleAgent` → `createMerovingianAgent`
    - **CAUTION**: "oracle" appears as `subagent_type` in many agent prompts — update all delegation examples
  - **Librarian → Operator**:
    - File rename: `src/agents/librarian.ts` → `src/agents/operator.ts`
    - Identity: "librarian" → "operator" in prompts, delegation strings
    - Factory: `createLibrarianAgent` → `createOperatorAgent`
    - **CAUTION**: "librarian" appears in delegation examples across Sisyphus, Prometheus, Hephaestus prompts — update all
  - **Explore → Trinity**:
    - File rename: `src/agents/explore.ts` → `src/agents/trinity.ts`
    - Identity: "explore" → "trinity" in prompts, delegation strings
    - Factory: `createExploreAgent` → `createTrinityAgent`
    - **CAUTION**: "explore" is used as `subagent_type` in task() calls across many prompt files — update all delegation examples
  - **Multimodal-Looker → Construct**:
    - File rename: `src/agents/multimodal-looker.ts` → `src/agents/construct.ts`
    - Identity: "multimodal-looker" → "construct" in prompts
    - Factory: `createMultimodalLookerAgent` → `createConstructAgent`
  - **Delegation tool**: Update `src/tools/delegate-task/tools.ts` — subagent_type validation to accept new names
  - **Call agent tool**: Update `src/tools/call-omo-agent/` — agent name validation

  **Must NOT do**:
  - Do NOT confuse Oracle (the current advisor agent → Merovingian) with Oracle (what Prometheus is being renamed TO). The Prometheus→Oracle rename is in Task 5.
  - Do NOT use blind find-replace for "operator" or "construct" — these are common words. Only replace in agent-identity context.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Four agents but each is a simple file with contained scope
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commits, file renames

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 3, 4, 5, 6)
  - **Blocks**: Tasks 8, 9, 10, 11
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/agents/oracle.ts` — Oracle agent definition (170 lines)
  - `src/agents/librarian.ts` — Librarian agent definition (328 lines)
  - `src/agents/explore.ts` — Explore agent definition (124 lines)
  - `src/agents/multimodal-looker.ts` — Multimodal agent definition (58 lines)

  **API/Type References**:
  - `src/tools/delegate-task/tools.ts` — `subagent_type` parameter validation (accepts "oracle", "explore")
  - `src/tools/call-omo-agent/` — Agent invocation validation
  - `src/agents/sisyphus.ts` (now morpheus.ts) — Contains delegation examples using "explore", "librarian", "oracle" in prompt text
  - `src/agents/hephaestus.ts` (now keymaker.ts) — Same delegation examples
  - `src/agents/prometheus/interview-mode.ts` (now oracle-planner/) — Same delegation examples

  **Test References**:
  - `src/tools/delegate-task/tools.test.ts` — Delegation tests
  - `src/agents/utils.test.ts` — Agent resolution tests

  **Acceptance Criteria**:

  ```
  Scenario: Advisor and exploration agents fully renamed
    Tool: Bash
    Steps:
      1. grep -ri "\boracle\b" src/agents/ --include="*.ts" | grep -v "oracle-planner" → Assert: only legitimate references to the Oracle planner agent remain
      2. grep -ri "\blibrarian\b" src/ --include="*.ts" → Assert: zero matches
      3. grep -ri "multimodal-looker" src/ --include="*.ts" → Assert: zero matches
      4. grep -ri "explore" src/agents/ --include="*.ts" | grep -v "Explore" → Assert: no agent-identity matches (word "explore" as verb is OK)
      5. ls src/agents/merovingian.ts → Assert: exists
      6. ls src/agents/operator.ts → Assert: exists
      7. ls src/agents/trinity.ts → Assert: exists
      8. ls src/agents/construct.ts → Assert: exists
      9. bun run typecheck → Assert: exit code 0
    Expected Result: All advisor and exploration agents renamed
  ```

  **Commit**: YES
  - Message: `refactor(agents): rename Oracle→Merovingian, Librarian→Operator, Explore→Trinity, Multimodal-Looker→Construct`
  - Pre-commit: `bun run typecheck`

---

- [ ] 8. Rename Delegation Categories and Team Names

  **What to do**:
  - **Categories** in `src/tools/delegate-task/constants.ts`:
    - Rename `DEFAULT_CATEGORIES` keys: visual-engineering→construct, ultrabrain→source, deep→deep-jack, artistry→matrix-bend, quick→bullet-time, unspecified-low→blue-pill, unspecified-high→red-pill, writing→broadcast
    - Rename `CATEGORY_PROMPT_APPENDS` keys to match
    - Rename `CATEGORY_DESCRIPTIONS` keys to match
    - Rename prompt append constants: `VISUAL_CATEGORY_PROMPT_APPEND` → `CONSTRUCT_CATEGORY_PROMPT_APPEND`, etc.
    - **CAUTION**: Category name "construct" overlaps with the agent name "Construct". Ensure the category key and agent name are distinguished by context (category = delegation routing, agent = the multimodal analyzer).
  - **Team names**: Update team/group references in documentation and prompt text where teams are mentioned (The Bridge, The Prophecy, The Crew, The Operators)
  - **Config schema**: Update `src/config/schema/hooks.ts` — hook name strings that reference old category names
  - **Config schema**: Update `src/config/schema/commands.ts` — command name strings
  - Update all prompt text that references category names in delegation examples
  - Update dynamic-agent-prompt-builder.ts if it references category names

  **Must NOT do**:
  - Do NOT change any agent definitions (those are done)
  - Do NOT change model assignments per category

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Focused on one subsystem (delegation), moderate effort
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 9, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `src/tools/delegate-task/constants.ts:200-231` — DEFAULT_CATEGORIES, CATEGORY_PROMPT_APPENDS, CATEGORY_DESCRIPTIONS
  - `src/agents/dynamic-agent-prompt-builder.ts` — May reference category names in prompt generation

  **Test References**:
  - `src/tools/delegate-task/tools.test.ts` — Category routing tests

  **Acceptance Criteria**:

  ```
  Scenario: Categories renamed to Matrix theme
    Tool: Bash
    Steps:
      1. grep "visual-engineering\|ultrabrain\|artistry\|unspecified-low\|unspecified-high" src/tools/delegate-task/constants.ts → Assert: zero matches
      2. grep "construct\|source\|deep-jack\|matrix-bend\|bullet-time\|blue-pill\|red-pill\|broadcast" src/tools/delegate-task/constants.ts → Assert: all 8 present
      3. bun run typecheck → Assert: exit code 0
    Expected Result: All categories use Matrix names
  ```

  **Commit**: YES
  - Message: `refactor(delegation): rename categories to Matrix theme`
  - Pre-commit: `bun run typecheck`

---

- [ ] 9. Rename Terminology: boulder → mission, Ralph Loop → Matrix Loop

  **What to do**:
  - **Boulder → Mission**:
    - Directory rename: `src/features/boulder-state/` → `src/features/mission-state/`
    - Type rename: `BoulderState` → `MissionState`
    - File rename: constants that produce `boulder.json` → `mission.json`
    - All references: "boulder state" → "mission state", "bouldering" → "jacking-in", "Keep bouldering" → "Keep jacking in"
    - `src/hooks/atlas/verification-reminders.ts:76` — "Keep bouldering" text
    - `src/hooks/atlas/boulder-continuation-injector.ts` → `mission-continuation-injector.ts`
    - Function names: `readBoulderState` → `readMissionState`, `clearBoulderState` → `clearMissionState`, `appendSessionId`, `getPlanProgress` (generic, keep as-is)
    - `src/agents/sisyphus.ts` (now morpheus.ts) — "boulder" metaphor text update
    - `src/features/boulder-state/types.ts:5` — comment about "Sisyphus's boulder"
    - All test files referencing boulder
  - **Ralph Loop → Matrix Loop**:
    - Directory rename: `src/hooks/ralph-loop/` → `src/hooks/matrix-loop/`
    - File renames within: `ralph-loop-hook.ts` → `matrix-loop-hook.ts`, `ralph-loop-event-handler.ts` → `matrix-loop-event-handler.ts`
    - Type/interface renames: `RalphLoopState` → `MatrixLoopState`, `RalphLoopHook` → `MatrixLoopHook`, `RalphLoopOptions` → `MatrixLoopOptions`, `RalphLoopConfig` → `MatrixLoopConfig`
    - Config schema: `src/config/schema/ralph-loop.ts` → `src/config/schema/matrix-loop.ts`, `RalphLoopConfigSchema` → `MatrixLoopConfigSchema`
    - Config key: `ralph_loop` → `matrix_loop` in oh-my-opencode-config.ts
    - Command names: `"ralph-loop"` → `"matrix-loop"`, `"cancel-ralph"` → `"cancel-loop"`
    - Command template: `src/features/builtin-commands/templates/ralph-loop.ts` → `matrix-loop.ts`
    - UI strings: "Ralph Loop Complete!" → "Matrix Loop Complete!", "Ralph Loop Stopped" → "Matrix Loop Stopped"
    - Hook name constant: `HOOK_NAME = "ralph-loop"` → `HOOK_NAME = "matrix-loop"`
    - State file: `.sisyphus/ralph-loop.local.md` → `.matrix/matrix-loop.local.md`
    - All plugin references: `hooks.ralphLoop` → `hooks.matrixLoop`
    - Builtin command types: Update `BuiltinCommandName` union
    - Auto-slash-command exclusion list: Update constants and tests
  - Run `bun run build:schema` after config changes

  **Must NOT do**:
  - Do NOT change functional logic of the loop or boulder system
  - Do NOT modify how continuation works — only rename identifiers and strings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches many files across multiple subsystems (boulder: 24 files, ralph: 30 files), high coordination needed
  - **Skills**: [`git-master`]
    - `git-master`: Atomic commits, directory renames with history

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 8, 10)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Pattern References**:
  - `src/features/boulder-state/` — 5 files: types.ts, storage.ts, constants.ts, storage.test.ts, index.ts
  - `src/hooks/ralph-loop/` — 8 files: ralph-loop-hook.ts, ralph-loop-event-handler.ts, loop-state-controller.ts, types.ts, storage.ts, constants.ts, continuation-prompt-builder.ts, continuation-prompt-injector.ts, index.ts, index.test.ts

  **API/Type References**:
  - `src/features/builtin-commands/types.ts:3` — BuiltinCommandName union
  - `src/features/builtin-commands/commands.ts` — Command definitions referencing ralph-loop, cancel-ralph
  - `src/features/builtin-commands/templates/ralph-loop.ts` — Template strings
  - `src/config/schema/ralph-loop.ts` — RalphLoopConfigSchema
  - `src/config/schema/oh-my-opencode-config.ts:44` — ralph_loop config field
  - `src/config/schema/hooks.ts:29` — "ralph-loop" hook name
  - `src/config/schema/commands.ts:5-7` — "ralph-loop", "cancel-ralph" command names
  - `src/plugin/chat-message.ts:100-135` — ralphLoop handling
  - `src/plugin/tool-execute-before.ts:42-91` — ralphLoop slash command handling
  - `src/plugin/hooks/create-session-hooks.ts:123-126` — ralphLoop hook creation
  - `src/plugin/event.ts:48` — ralphLoop event forwarding
  - `src/hooks/auto-slash-command/constants.ts:9-10` — Excluded commands

  **Test References**:
  - `src/hooks/ralph-loop/index.test.ts` — Extensive loop tests (900+ lines)
  - `src/features/boulder-state/storage.test.ts` — Boulder state tests
  - `src/hooks/auto-slash-command/index.test.ts` — Tests referencing ralph-loop
  - `src/hooks/auto-slash-command/detector.test.ts` — Tests referencing ralph-loop, cancel-ralph
  - `src/features/builtin-commands/templates/stop-continuation.test.ts` — Tests for "Ralph Loop" string
  - `src/plugin/event.test.ts` — Tests with ralphLoop mock
  - `src/hooks/todo-continuation-enforcer/todo-continuation-enforcer.test.ts` — Boulder tests
  - `src/hooks/atlas/index.test.ts` — Boulder continuation tests (50+ references)
  - `src/hooks/start-work/index.test.ts` — Boulder state tests
  - `src/hooks/prometheus-md-only/index.test.ts` — Boulder state priority tests

  **Acceptance Criteria**:

  ```
  Scenario: Boulder terminology fully replaced with Mission
    Tool: Bash
    Steps:
      1. grep -ri "boulder" src/ --include="*.ts" → Assert: zero matches
      2. grep -ri "mission.state\|MissionState\|readMissionState" src/ --include="*.ts" → Assert: matches present
      3. ls src/features/mission-state/ → Assert: directory exists
    Expected Result: All boulder references replaced with mission

  Scenario: Ralph Loop fully replaced with Matrix Loop
    Tool: Bash
    Steps:
      1. grep -ri "ralph" src/ --include="*.ts" → Assert: zero matches
      2. grep -ri "matrix.loop\|MatrixLoop\|createMatrixLoopHook" src/ --include="*.ts" → Assert: matches present
      3. ls src/hooks/matrix-loop/ → Assert: directory exists
    Expected Result: All Ralph references replaced with Matrix Loop

  Scenario: Schema and types still valid
    Tool: Bash
    Steps:
      1. bun run build:schema → Assert: exit code 0
      2. bun run typecheck → Assert: exit code 0
    Expected Result: Schema regenerated cleanly
  ```

  **Commit**: YES (two commits)
  - Message 1: `refactor(features): rename boulder→mission terminology and state`
  - Message 2: `refactor(hooks): rename Ralph Loop→Matrix Loop`
  - Pre-commit: `bun run typecheck`

---

- [ ] 10. Update Documentation (AGENTS.md files, README)

  **What to do**:
  - **Root AGENTS.md**: Update all agent names, models table, team names, structure diagram, complexity hotspots, WHERE TO LOOK table
  - **src/AGENTS.md**: Update plugin interface references
  - **src/agents/AGENTS.md**: Update agent table, structure, model table, tool restrictions
  - **src/hooks/AGENTS.md** (if exists): Update hook names
  - **src/features/AGENTS.md** (if exists): Update feature names
  - **src/tools/AGENTS.md** (if exists): Update tool references
  - **README.md**: Update all "Sisyphus" references, "Meet Sisyphus" section → "Meet Morpheus", "Sisyphus Labs" mention, agent listing, workflow description
  - **README.ko.md, README.ja.md, README.zh-cn.md**: Same updates for translated READMEs
  - **docs/**: Any documentation files referencing old agent names
  - Update the ASCII art/diagram if present
  - Replace Greek mythology lore with Matrix lore where appropriate

  **Must NOT do**:
  - Do NOT change the npm package name
  - Do NOT change image file references (the .github/assets/sisyphus.png etc. — those are separate assets)
  - Do NOT modify the LICENSE file

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Documentation updates, no code logic changes
  - **Skills**: [`git-master`]
    - `git-master`: Clean documentation commit

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Tasks 3, 4, 5, 6, 7

  **References**:

  **Documentation Files**:
  - `AGENTS.md` (root) — Main project knowledge base
  - `src/AGENTS.md` — Source overview
  - `src/agents/AGENTS.md` — Agent-specific documentation
  - `README.md` — Main README with extensive Sisyphus references
  - `README.ko.md`, `README.ja.md`, `README.zh-cn.md` — Translated READMEs
  - `docs/` directory — Feature and configuration documentation

  **Acceptance Criteria**:

  ```
  Scenario: Documentation uses Matrix names
    Tool: Bash
    Steps:
      1. grep -i "sisyphus" AGENTS.md → Assert: zero matches (except historical notes if any)
      2. grep -i "Morpheus\|Architect\|Keymaker\|Merovingian" AGENTS.md → Assert: matches present
      3. grep -i "sisyphus" README.md | grep -v "Labs" | head → Assert: minimal/zero matches
    Expected Result: Documentation updated to Matrix theme
  ```

  **Commit**: YES
  - Message: `docs: update all documentation to Matrix theme naming`
  - Pre-commit: None (docs only)

---

- [ ] 11. Final Verification and Schema Rebuild

  **What to do**:
  - Run `bun run build:schema` one final time
  - Run `bun run typecheck` — must pass
  - Run `bun test` — all 176 test files must pass
  - Run `bun run build` — must succeed
  - Run comprehensive grep to verify NO old names remain:
    - `grep -ri "sisyphus\|atlas\b\|prometheus\|hephaestus\|metis\b\|momus\b" src/ --include="*.ts"` → zero matches
    - `grep -ri "\blibrarian\b\|multimodal-looker" src/ --include="*.ts"` → zero matches
    - `grep -ri "\.sisyphus" src/ --include="*.ts"` → zero matches
    - `grep -ri "\bboulder\b" src/ --include="*.ts"` → zero matches
    - `grep -ri "\bralph\b" src/ --include="*.ts"` → zero matches
  - Verify new names ARE present:
    - `grep -ri "morpheus\|architect\|keymaker\|merovingian\|seraph\|smith" src/agents/types.ts` → all present
    - `grep -ri "mission.json\|MissionState" src/ --include="*.ts"` → present
    - `grep -ri "MatrixLoop\|matrix-loop" src/ --include="*.ts"` → present
    - `grep -ri "\.matrix" src/ --include="*.ts"` → present

  **Must NOT do**:
  - Do NOT make any code changes — this is verification only
  - If tests fail, report failures but do NOT fix (that indicates a Task 3-9 issue)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Command execution only, no code changes
  - **Skills**: [`git-master`]
    - `git-master`: Final verification

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (final, solo)
  - **Blocks**: None
  - **Blocked By**: Tasks 8, 9, 10

  **References**:

  **Verification Commands**:
  - `bun run build:schema`, `bun run typecheck`, `bun test`, `bun run build`

  **Acceptance Criteria**:

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. bun test → Assert: 0 failures, all 176 test files pass
      2. bun run typecheck → Assert: exit code 0
      3. bun run build → Assert: exit code 0
    Expected Result: Everything green

  Scenario: No old names remain in source
    Tool: Bash
    Steps:
      1. grep -ri "sisyphus\|hephaestus\|prometheus\|momus\|metis" src/ --include="*.ts" → Assert: zero matches
      2. grep -ri "\.sisyphus\|boulder\|ralph" src/ --include="*.ts" → Assert: zero matches
    Expected Result: Complete rename verified

  Scenario: New names present in source
    Tool: Bash
    Steps:
      1. grep -ri "morpheus\|architect\|keymaker\|merovingian\|seraph\|smith\|mouse\|trinity\|construct\|operator" src/agents/types.ts → Assert: all present
      2. grep "\.matrix" src/features/mission-state/constants.ts → Assert: present
    Expected Result: Matrix names confirmed
  ```

  **Commit**: YES (if schema rebuild produced changes)
  - Message: `chore: final schema rebuild after Matrix rename`
  - Pre-commit: `bun test`

---

## Commit Strategy

| After Task | Message | Verification |
|------------|---------|--------------|
| 2 | `refactor(core): rename agent types and .sisyphus→.matrix directory references` | `bun run typecheck` |
| 3 | `refactor(agents): rename Sisyphus→Morpheus and Sisyphus-Junior→Mouse` | `bun run typecheck` |
| 4 | `refactor(agents): rename Atlas→Architect` | `bun run typecheck` |
| 5 | `refactor(agents): rename Prometheus→Oracle, Metis→Seraph, Momus→Smith` | `bun run typecheck` |
| 6 | `refactor(agents): rename Hephaestus→Keymaker` | `bun run typecheck` |
| 7 | `refactor(agents): rename Oracle→Merovingian, Librarian→Operator, Explore→Trinity, Multimodal-Looker→Construct` | `bun run typecheck` |
| 8 | `refactor(delegation): rename categories to Matrix theme` | `bun run typecheck` |
| 9 | `refactor(features): rename boulder→mission, Ralph Loop→Matrix Loop` | `bun run typecheck && bun run build:schema` |
| 10 | `docs: update all documentation to Matrix theme naming` | none |
| 11 | `chore: final schema rebuild after Matrix rename` | `bun test && bun run build` |

---

## Success Criteria

### Verification Commands
```bash
bun test           # Expected: 0 failures, 176 test files
bun run typecheck  # Expected: exit code 0
bun run build      # Expected: clean build

# Old names absent
grep -ri "sisyphus\|hephaestus\|prometheus\|momus\|metis" src/ --include="*.ts"  # Expected: 0 matches
grep -ri "\.sisyphus\|boulder\|ralph" src/ --include="*.ts"  # Expected: 0 matches
grep -ri "librarian\|multimodal-looker" src/ --include="*.ts"  # Expected: 0 matches

# New names present
grep "morpheus\|architect\|oracle\|seraph\|smith\|keymaker\|mouse\|merovingian\|operator\|trinity\|construct" src/agents/types.ts
grep "\.matrix" src/features/mission-state/constants.ts
grep "MatrixLoop" src/hooks/matrix-loop/matrix-loop-hook.ts
grep "MissionState" src/features/mission-state/types.ts
```

### Final Checklist
- [ ] All 11 agents renamed to Matrix theme
- [ ] All 4 team groups renamed
- [ ] All 8 delegation categories renamed
- [ ] All file/directory names updated
- [ ] `.sisyphus/` → `.matrix/` everywhere
- [ ] boulder → mission everywhere
- [ ] Ralph Loop → Matrix Loop everywhere
- [ ] All AGENTS.md files updated
- [ ] README updated
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 176 tests pass
- [ ] TypeScript compiles cleanly
- [ ] Build succeeds
