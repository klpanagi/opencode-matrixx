# Quality: BDD Pipeline & TDD Discipline

> **Audience:** users implementing features or enforcing test discipline.
> **Version:** 2.6.10.
> **See also:** `command-reference.md` (the `/bdd-pipeline` command), `orchestration.md` (how plans execute), `hooks.md` §2.1 (`oracle-md-only`, `quality-gate`).

Two complementary workflows produce tested code. **BDD** starts from a `.feature` file and generates the implementation through a contract; **TDD** governs how any implementation is written (test first, then code, then refactor).

| Workflow | Starts from | Produces | Use when |
|---|---|---|---|
| BDD pipeline (Part A) | A `.feature` file | Contract → tests → frontend → backend | A new feature with describable behavior |
| TDD discipline (Part B) | Any task | Oracle plan → failing test → code → pass → refactor | Any code change where regression matters |

Both run under the same execution discipline: Oracle plans, workers implement, `quality-gate` lints, evidence is required.

---

# Part A — BDD Pipeline

> **Status**: Shipped and verified
> **Package**: `opencode-matrixx` (v2.6.10)
> **Context**: Native matrixx feature — no Python, no external bundling

---

### Table of Contents

1. [What It Is](#what-it-is)
2. [Architecture Overview](#architecture-overview)
3. [Pipeline Flow](#pipeline-flow)
4. [Available Slash Commands](#available-slash-commands)
5. [Example Walkthrough](#example-walkthrough)
6. [Agent Reference](#agent-reference)
7. [Technical Details](#technical-details)
8. [Getting Started](#getting-started)

---

### What It Is

| The BDD Pipeline is a **first-class feature in matrixx** that transforms Gherkin `.feature` files into production-ready artifacts through AI agents. Given a feature file, the pipeline produces:

- **📋 Contract JSON** — Structured, schema-validated representation of the feature
- **🧪 Tests** — Cucumber step definitions + page objects (E2E test suite)
- **🎨 Frontend** — React components derived from UI annotations
- **⚙️ Backend** — Typed API services with Zod validation

| All of this is driven by matrixx's built-in agents and skills — no human-in-loop required. The `bdd-contract` agent enriches the parsed Contract, and **Morpheus** (with `bdd-frontend`, `bdd-backend`, `bdd-tests` skills) generates the test, frontend, and backend artifacts. |

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Gherkin .feature file                     │
│    (login.feature, checkout.feature, api-pagination.feature) │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Deterministic Tools                       │
│                                                              │
│  bdd_parse_gherkin     →  AST from @cucumber/gherkin         │
│  bdd_create_contract   →  AST → Contract JSON (Zod v4)       │
│  bdd_validate_contract →  Contract JSON → schema check       │
│  bdd_pipeline_run      →  full pipeline + ANALYSIS.md        │
│                                                              │
│  These are TDD-tested, deterministic, no LLM involved.        │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI Agents (EXPENSIVE)                       │
│                                                               │
| │  bdd-contract  → Enriches Contract with semantic insights      |
| │  Morpheus      → Runs bdd-frontend / bdd-tests / bdd-backend  │
| │                  skills to generate components, step defs,    │
| │                  and typed API services                        |
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌────────────┬──────────┬──────────┬───────────────────────────┐
│ Contract   │ Tests    │ Frontend │ Backend                    │
│ JSON       │ .steps   │ .tsx     │ .ts (Zod services)        │
│            │ .pageobj │          │                            │
└────────────┴──────────┴──────────┴───────────────────────────┘
```

#### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No Python** | Pure TypeScript/Node.js — consistent with matrixx stack |
| **No `stories_2_tdd` bundling** | Agents do the work natively; no legacy code import |
| **5 separate slash commands** | No subcommand routing infrastructure needed |
| **Deterministic tools first, agents second** | Tools (bdd_parse_gherkin, bdd_create_contract) do the parsing work; agents enrich on top |
|| **1 new EXPENSIVE agent** | `bdd-contract` is the only specialist — Morpheus (the matrixx orchestrator) handles tests/frontend/backend via skills |

---

### Pipeline Flow

#### Step-by-Step Data Flow

```
                  ┌─────────────────────┐
                  │  .feature file       │
                  │  (Gherkin syntax)    │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │  bdd_parse_gherkin   │  ← Deterministic tool
                  │                     │
                  │  Uses @cucumber/    │
                  │  gherkin v34        │
                  │  generateMessages() │
                  └──────────┬──────────┘
                             │ GherkinDocument AST (JSON)
                             ▼
                  ┌─────────────────────┐
                  │  bdd_create_contract │  ← Deterministic tool
                  │                     │
                  │  Parses annotations │
                  │  Validates schema   │
                  │  Writes JSON file   │
                  └──────────┬──────────┘
                             │ Contract JSON v1
                             │ (schemaVersion: 1)
                             ▼
             ┌───────────────┴───────────────┐
             │                               │
             ▼                               ▼
   ┌──────────────────┐          ┌─────────────────────┐
   │  bdd-contract     │          │  Contract JSON file  │
   │  (agent enrich)  │          │  (used downstream)    │
   └──────────────────┘          └──────────┬──────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
        ┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐
        │  Morpheus         │   │  Morpheus         │   │  Morpheus            │
        │  + bdd-tests      │   │  + bdd-frontend   │   │  + bdd-backend       │
        │                   │   │                  │   │                    │
        │  Step defs        │   │  React           │   │  Typed API         │
        │  Page objects     │   │  components      │   │  services (Zod)    │
        │  npx cucumber-js  │   │  (@ui:* annot.)  │   │  (@api:* annot.)   │
        └──────────────────┘   └──────────────────┘   └────────────────────┘
```

---

### Available Slash Commands

There are **5 slash commands**, each accessible from the matrixx chat prompt:

#### 1. `/bdd-contract <feature-path> [--force]`

**Purpose**: Parse a `.feature` file and produce a Contract JSON.

```
/bdd-contract demos/bdd/login/1001_username_password.feature
```

**What happens**:
1. Reads the `.feature` file
2. Parses it with `@cucumber/gherkin` (deterministic AST)
3. Extracts Gherkin comments as structured annotations (`@api:*`, `@ui:*`, `@state:*`, `@assumption:`)
4. Produces `.contract.json` next to the source file
5. The `bdd-contract` agent enriches the contract with semantic insights

**Output**: `<feature-path>.contract.json`

```
// login.contract.json (simplified)
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-06T...",
  "sourceFile": "demos/bdd/login/1001_username_password.feature",
  "feature": {
    "name": "User Login",
    "description": "As a registered user...",
    "tags": [],
    "annotations": {}
  },
  "scenarios": [
    {
      "name": "Successful login with valid credentials",
      "tags": [],
      "steps": [
        { "keyword": "Given", "text": "the user is on the login page" },
        { "keyword": "When", "text": "the user enters \"alice@example.com\" as the email" },
        ...
      ]
    }
  ],
  "annotations": {
    "ui": [{ "key": "form", "value": "login-form-component" }, ...],
    "api": [{ "endpoint": "POST /api/v1/auth/login" }],
    "state": [{ "name": "session", "value": "new-session-init" }]
  }
}
```

#### 2. `/bdd-tests <contract.json>`

**Purpose**: Generate Cucumber step definitions + page objects from a Contract JSON.

```
/bdd-tests demos/bdd/login/1001_username_password.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-tests` skill (loaded into Morpheus) generates `*.steps.ts` files (Given/When/Then implementations)
3. Generates page object files (encapsulating UI interactions)
4. You run tests with `npx cucumber-js`

**Output**: Step definition files + page object files

#### 3. `/bdd-frontend <contract.json>`

**Purpose**: Generate React components from a Contract JSON (using `@ui:*` annotations).

```
/bdd-frontend demos/bdd/login/1001_username_password.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-frontend` skill (loaded into Morpheus) generates React components
3. Uses `@ui:route`, `@ui:testid`, `@ui:string` annotations to drive component design
4. Generates functional React components

**Output**: `.tsx` component files

#### 4. `/bdd-backend <contract.json>`

**Purpose**: Generate typed API services from a Contract JSON (using `@api:*` annotations).

```
/bdd-backend demos/bdd/login/1001_username_password.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-backend` skill (loaded into Morpheus) generates typed service files
3. Uses `@api:endpoint` and `@api:response` annotations for request/response types
4. Uses Zod schemas for runtime validation

**Output**: `.ts` service files with Zod schemas

#### 5. `/bdd-pipeline <feature-path> [--force]`

**Purpose**: Run the full pipeline end-to-end — all 4 steps in sequence.

```
/bdd-pipeline demos/bdd/login/1001_username_password.feature
```

**Pipeline Steps**:
1. `/bdd-contract` — Parse feature → generate Contract JSON
2. `/bdd-tests` — Generate Cucumber step definitions + page objects
3. `/bdd-frontend` — Generate React components
4. `/bdd-backend` — Generate typed API services

**Output**: All 4 artifacts produced in a single orchestrated run, plus `ANALYSIS.md` in the per-feature output dir (the `/bdd-pipeline` command delegates to the `bdd_pipeline_run` tool — it does not just chain the four commands)

Validate a contract on its own at any point with `/bdd-pipeline`'s sibling tool `bdd_validate_contract`, or regenerate with `--force`.

---

### Example Walkthrough

#### Starting Point: `login.feature`

```gherkin
Feature: User Login
  As a registered user
  I want to log in with my credentials
  So that I can access my account dashboard

  Scenario: Successful login with valid credentials
    Given the user is on the login page
    When the user enters "alice@example.com" as the email
    And the user enters "securePass123" as the password
    Then the user should be redirected to the dashboard
    And a welcome message should be displayed
```

#### Step 1: `/bdd-contract login.feature`

Produces `login.contract.json` — a structured representation containing:
- Feature metadata (name, description)
- All scenarios with their steps
- Extracted annotations grouped by type (`api`, `ui`, `state`, `assumptions`)
- `schemaVersion: 1` for future compatibility

#### Step 2: `/bdd-tests login.contract.json`

Produces Cucumber step definition files:
```typescript
// login.steps.ts
import { Given, When, Then } from "@cucumber/cucumber";
import { LoginPage } from "./login.page";

const page = new LoginPage();

Given("the user is on the login page", async () => {
  await page.navigate();
});

When("the user enters {string} as the email", async (email: string) => {
  await page.enterEmail(email);
});
// ...
```

#### Step 3: `/bdd-frontend login.contract.json`

Produces a React component:
```tsx
// Login.tsx
export function Login({ onLogin }: LoginProps) {
  return (
    <div data-testid="login-form-component">
      <form onSubmit={...}>
        <input data-testid="email-input" type="email" />
        <button data-testid="login-submit-button" type="submit">
          Log In
        </button>
      </form>
    </div>
  );
}
```

#### Step 4: `/bdd-backend login.contract.json`

Produces a typed API service:
```typescript
// auth.ts
import { z } from "zod";

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginResponseSchema = z.object({
  token: z.string(),
  redirectTo: z.string(),
});

export async function login(data: z.infer<typeof LoginRequestSchema>) {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(LoginRequestSchema.parse(data)),
  });
  return LoginResponseSchema.parse(await response.json());
}
```

---

### Agent Reference

#### New Agent (1 EXPENSIVE)

| Agent | Cost | Mode | Skill | Purpose |
|-------|------|------|-------|---------|
| **bdd-contract** | EXPENSIVE | `all` | `bdd-contract` | Enrich parsed Contract JSON with business semantics, naming, and intent |

#### Reused Agent

| Agent | Skills Loaded | Purpose |
|-------|---------------|---------|
| **Morpheus** (existing) | `bdd-frontend`, `bdd-backend`, `bdd-tests` | Generates React components, Cucumber step defs, and typed API services from Contract JSON |

#### Existing Specialist (Frontend)

| Agent | Skill Loaded | Purpose |
|-------|---------------|---------|
| **Sati** (existing) | `bdd-frontend` (alt path) | Same `bdd-frontend` skill — Sati remains a valid invocation target for React-specific work |

#### Existing Agent (Reused)

| Agent | Skill Loaded | Purpose |
|-------|-------------|---------|
| **Sati** (existing) | `bdd-frontend` | Generate React components from Contract `@ui:*` annotations |

#### Agent Architecture

| The `bdd-contract` agent follows the **Cipher template** (see `src/agents/cipher.ts`): |

```
┌──────────────────────────────────────────────────────────┐
│                   Agent Factory                            │
│                                                           │
│  createXxxAgent(model: string): AgentConfig                │
│                                                           │
│  Claude branch:                                            │
│    - thinking: { type: "enabled", budgetTokens: 10000 }   │
│    - temperature: 0.1                                      │
│    - maxTokens: 16000                                      │
│                                                           │
│  GPT branch:                                               │
│    - reasoningEffort: "medium"                             │
│    - textVerbosity: "high"                                 │
│    - maxTokens: 16000                                      │
└──────────────────────────────────────────────────────────┘
```

| `bdd-contract` is registered in `agentSources` and `agentMetadata` in `src/agents/builtin-agents.ts`, discoverable via the agent menu (mode: `"all"`). The `bdd-frontend` / `bdd-backend` / `bdd-tests` skills are auto-loaded into Morpheus via `buildAvailableSkills()` and surfaced through the dynamic prompt builder — no specialist wrapper agents are needed. |

---

### Technical Details

#### Contract JSON Schema (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | `1` (literal) | ✅ | Version identifier for forward compatibility |
| `generatedAt` | ISO 8601 datetime | ✅ | When the contract was generated |
| `sourceFile` | string (path) | ✅ | Path to the original `.feature` file |
| `feature` | FeatureObject | ✅ | Feature name, description, tags, feature-level annotations |
| `scenarios` | Scenario[] | ✅ | List of scenarios with steps, tags, optional examples |
| `background` | Background? | ❌ | Shared background steps (Gherkin `Background:`) |
| `rules` | Rule[]? | ❌ | Gherkin 6+ `Rule:` blocks |
| `annotations` | Annotations | ✅ | Structured annotations: api, ui, state, assumptions |

#### Annotation Types (LLM-inferred)

Annotations are NOT placed in `.feature` files. The `.feature` file must be 100% pure Gherkin. The bdd-contract agent infers all annotations from the feature content via LLM reasoning and writes them into the Contract JSON.

| Annotation Field | Inferred From |
|------------------|----------------|
| `annotations.api[].method` + `path` | HTTP verbs (GET/POST/PUT/DELETE), URL paths in step text |
| `annotations.api[].description` | API context from feature/scenario descriptions |
| `annotations.ui[].component` | Page/screen names, form/button patterns in step text |
| `annotations.ui[].description` | UI element context |
| `annotations.state[].key` | Form field names, session/auth/cart state references |
| `annotations.state[].description` | State variable purpose and lifecycle |
| `annotations.assumptions[]` | Implicit preconditions, business rules in feature description |

#### Deterministic Tools

**`bdd_parse_gherkin`**
- Input: `.feature` file path
- Output: JSON-serialized GherkinDocument AST
- Uses: `@cucumber/gherkin` `generateMessages()` with `SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN`
- TDD: 6 tests (valid file, missing file, malformed, sourceMap toggle, empty file)

**`bdd_create_contract`**
- Input: parsed AST JSON + source file path + options
- Output: `<feature-path>.contract.json` written alongside the source file (with empty annotations)
- Steps: walks GherkinDocument AST, validates against `ContractSchema`. Annotations are LEFT EMPTY — the bdd-contract agent fills them via LLM inference from feature content
- Annotation parsing lives in `src/tools/bdd-create-contract/tools.ts`; contract types in `src/features/bdd/schema.ts` + `src/features/bdd/types.ts`
- TDD: 9 tests (valid contract, schema validation, force flag, malformed input, data tables, outlines, rules, empty annotations)

**`bdd_validate_contract`**
- Input: path to a Contract JSON file
- Output: schema validation result against `ContractSchema`
- Use it to check a contract before running `/bdd-tests`, `/bdd-frontend`, or `/bdd-backend`

**`bdd_pipeline_run`**
- Input: one or more `.feature` file paths (or directories/globs) + output dir
- Output: full pipeline run (contract → tests → frontend → backend) plus `ANALYSIS.md` in the per-feature output dir
- This is what `/bdd-pipeline` invokes; see `src/tools/bdd-pipeline/` (`pipeline-runner.ts`, `subagent-runner.ts`, `feature-resolver.ts`, `analysis-report.ts`)

#### Guardrails (Must NOT Have)

| Guardrail | Enforced |
|-----------|----------|
| ❌ No Python files | ✓ 0 Python files added |
| ❌ No stories_2_tdd imports | ✓ None |
| ❌ No new MCP servers | ✓ None |
| ❌ No new hooks | ✓ None |
| ❌ No auto-installation of test runners | ✓ User runs `bun install` themselves for cucumber |
| ❌ No new specialist agents for tests/frontend/backend | ✓ These run via Morpheus + bdd-* skills (single-source-of-truth consolidation) |
| ❌ No subcommand routing | ✓ 5 separate commands |

#### Fixtures

Real demo features live under `demos/bdd/` (numbered, e.g. `demos/bdd/login/1001_username_password.feature`). Each demo dir can contain a `bdd.config.json`, `cucumber.cjs`, generated `*.contract.json` files alongside the features, and pipeline outputs (`ANALYSIS.md`, `backend/`, `components/`, `tests/`, `reports/`):

| Demo dir | Content |
|---------|-----------|
| `demos/bdd/login/` | Username/password, PIN, biometric, migrated-user scenarios |
| `demos/bdd/recovery/` | OTP verification, password reset scenarios |
| `demos/bdd/session/` | Session timeout scenarios |
| `demos/bdd/registration/`, `demos/bdd/welcome/` | Registration and welcome flows |

Run per-demo tests with the `run-tests.sh` inside each demo dir.

---

### Getting Started

#### Prerequisites

- matrixx (opencode-matrixx v2.6.10+)
- `@cucumber/gherkin` v34 (bundled dependency — auto-installed with matrixx)
- `@cucumber/cucumber` and `@playwright/test` (user-installed per project)

#### Running the Pipeline

```bash
# 1. Full pipeline (recommended for new features)
/bdd-pipeline src/features/my-feature.feature

# 2. Individual steps
/bdd-contract src/features/my-feature.feature
/bdd-tests src/features/my-feature.contract.json
/bdd-frontend src/features/my-feature.contract.json
/bdd-backend src/features/my-feature.contract.json

# 3. Overwrite existing artifacts
/bdd-contract src/features/my-feature.feature --force
/bdd-pipeline src/features/my-feature.feature --force
```

#### Writing Good Feature Files

The better your annotations, the better the generated code:

```gherkin
# @api:endpoint GET /api/users
# @api:response 200 { users: User[] }
# @ui:route /users -> UserListPage
# @ui:testid container=user-list-container
# @state:variable users User[] empty
# @assumption: Users are sorted by creation date descending
Feature: User Management
  ...
```

#### Verification

After running the pipeline:

```bash
# Run generated tests
npx cucumber-js

# Typecheck generated code
bun run typecheck

# Lint generated code
bun run lint
```

---

### Implementation Stats

| Metric | Value |
|--------|-------|
| New test files | 49+ (12 agent + 23 schema/annotation + 14 tool) |
| New source files | ~28 across features/, agents/, tools/ |
| Commits | 16 on `feat/bdd` branch (after consolidation) |
| Branch target | `dev` (merge to `dev`, not `master`) |
| Production deps added | 1 (`@cucumber/gherkin`) |
| Dev deps added | 3 (`@cucumber/cucumber`, `@playwright/test`, `tsx` — for generated E2E test runs) |
| Lines of implementation | ~800 (non-test, non-prompt) |
| Lines of tests | ~1,300 |

---

### File Map

```
src/
├── features/bdd/
│   ├── schema.ts              ← Contract JSON v1 Zod schema (ContractSchema, ContractAnnotationsSchema)
│   ├── types.ts               ← Re-exported TypeScript types
├── tools/
│   ├── bdd-parse-gherkin/     ← bdd_parse_gherkin tool (createBddParseGherkinTool)
│   ├── bdd-create-contract/   ← bdd_create_contract tool (createBddCreateContractTool, annotation parsing)
│   ├── bdd-validate-contract/ ← bdd_validate_contract tool (createBddValidateContractTool)
│   └── bdd-pipeline/          ← bdd_pipeline_run tool (pipeline-runner, subagent-runner, feature-resolver, analysis-report)
├── agents/
│   ├── bdd-contract.ts        ← BDD contract specialist agent (only new agent)
│   ├── bdd-contract.test.ts   ← 12 agent tests
│   ├── morpheus.ts            ← Matrixx orchestrator (runs bdd-tests, bdd-frontend, bdd-backend)
├── features/builtin-skills/skills/
│   ├── bdd-contract.ts        ← BDD contract skill (template prompt)
│   ├── bdd-tests.ts           ← BDD tests skill
│   ├── bdd-frontend.ts        ← BDD frontend skill
│   └── bdd-backend.ts         ← BDD backend skill
└── features/builtin-commands/templates/
    ├── bdd-contract.ts        ← /bdd-contract command template
    ├── bdd-tests.ts           ← /bdd-tests command template
    ├── bdd-frontend.ts        ← /bdd-frontend command template
    ├── bdd-backend.ts         ← /bdd-backend command template
    └── bdd-pipeline.ts        ← /bdd-pipeline command template
```

# Part B — TDD Discipline

### TL;DR

TDD in Matrixx operates at **two layers**:

| Layer | Agent/Skill | Responsibility |
|-------|-------------|----------------|
| **Planning** | Oracle | Decides *what* to test, *when*, and *why* — bakes TDD instructions into every work plan task |
| **Enforcement** | `tdd-enforcer` skill | Ensures the executing agent *actually follows* RED-GREEN-REFACTOR at runtime |

```
Oracle (plans) → includes TDD instructions in every task
    ↓
Developer (executes) → loads tdd-enforcer skill to follow those instructions
```

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER REQUEST                                 │
│                  "Implement feature X"                              │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ORACLE (PLANNER)                                │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  PLAN TEMPLATE (plan-template.ts)                           │   │
│  │                                                              │   │
│  │  • Test Decision section: YES/NO for TDD                    │   │
│  │  • If TDD → each task includes RED-GREEN-REFACTOR steps     │   │
│  │  • Acceptance criteria: bun test commands + expected output  │   │
│  │  • QA scenarios: agent-executed verification steps           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Output: .matrixx/plans/{name}.md                                   │
│          (TDD instructions baked into every task)                   │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  SOFTWARE-DEV PIPELINE                              │
│                  (software-dev.ts)                                  │
│                                                                     │
│  Phase 1: PLAN ─→ Phase 2: BUILD (TDD) ─→ Phase 3: VERIFY ─→ ...  │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  DEVELOPER AGENT (category="source")                        │   │
│  │                                                              │   │
│  │  load_skills=["git-master", "tdd-enforcer"]                 │   │
│  │                                                              │   │
│  │  For each file:                                              │   │
│  │    1. RED: Write failing test first                          │   │
│  │    2. GREEN: Minimum code to pass                            │   │
│  │    3. REFACTOR: Clean up while green                         │   │
│  │    4. Run bun test after each change                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Layer 1: Oracle — Planning TDD

Oracle enforces TDD through the **plan template** (`src/agents/oracle/plan-template.ts`). When generating a work plan, Oracle includes TDD instructions in every task.

#### Test Decision Block

Every plan includes a test decision section:

```markdown
### Test Decision
- **Infrastructure exists**: [YES/NO]
- **Automated tests**: [TDD / Tests-after / None]
- **Framework**: [bun test / vitest / jest / pytest / none]
```

#### If TDD Is Enabled

Each task in the plan follows RED-GREEN-REFACTOR:

```markdown
### If TDD Enabled

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
   - Test file: `[path].test.ts`
   - Test command: `bun test [file]`
   - Expected: FAIL (test exists, implementation doesn't)
2. **GREEN**: Implement minimum code to pass
   - Command: `bun test [file]`
   - Expected: PASS
3. **REFACTOR**: Clean up while keeping green
   - Command: `bun test [file]`
   - Expected: PASS (still)
```

#### Per-Task Acceptance Criteria

Each task's acceptance criteria includes TDD-specific verification:

```markdown
**If TDD (tests enabled):**
- [ ] Test file created: src/auth/login.test.ts
- [ ] Test covers: successful login returns JWT token
- [ ] bun test src/auth/login.test.ts → PASS (3 tests, 0 failures)
```

#### Agent-Executed QA Scenarios

Beyond unit tests, Oracle mandates agent-executed QA scenarios for integration/E2E verification:

```markdown
Scenario: Successful login redirects to dashboard
  Tool: Playwright (playwright skill)
  Preconditions: Dev server running on localhost:3000
  Steps:
    1. Navigate to: http://localhost:3000/login
    2. Fill: input[name="email"] → "test@example.com"
    3. Click: button[type="submit"]
    4. Wait for: navigation to /dashboard
    5. Assert: h1 text contains "Welcome back"
  Expected Result: Dashboard loads with welcome message
```

---

### Layer 2: tdd-enforcer — Execution Enforcement

The `tdd-enforcer` skill (`src/features/builtin-skills/skills/tdd-enforcer.ts`) is loaded by the Developer agent at execution time. It enforces the RED-GREEN-REFACTOR cycle defined in the plan.

#### Prime Directive

```
NO IMPLEMENTATION WITHOUT A FAILING TEST FIRST.

| Situation           | Required First Action                    |
|---------------------|------------------------------------------|
| Bug fix             | Write a test that REPRODUCES the bug     |
| New feature         | Write failing tests for each criterion   |
| New function/class  | Write test file BEFORE source file       |
| Refactor            | Verify coverage; write tests if missing  |
| Any code change     | "Do I have a failing test?" — if NO, STOP|
```

#### RED-GREEN-REFACTOR Cycle

```
RED     → Write a test. Run it. It MUST fail (for the right reason).
GREEN   → Write minimum code to make that test pass. No more.
REFACTOR → Clean up code. Tests MUST stay green throughout.
```

#### Self-Check Gates

```markdown
Before GREEN:
  "Does my test fail with the expected error? (not a compile error)"
  IF NO → Fix the test. Do not proceed.

Before REFACTOR:
  "Does bun test pass with 0 failures?"
  IF NO → Fix the implementation. Do not proceed.

Before marking task DONE:
  "Does bun test pass with 0 failures?"
  "Have I written tests for EVERY change I made?"
  IF EITHER IS NO → STOP. Fix it. Do not report done.
```

#### Test Conventions

| Convention | Rule |
|------------|------|
| **File placement** | `src/foo/bar.ts` → `src/foo/bar.test.ts` (alongside source) |
| **BDD markers** | `//#given` / `//#when` / `//#then` in every test case |
| **Imports** | `import { describe, test, expect } from "bun:test"` |
| **Evidence** | `bun test` + `bun run typecheck` must pass before marking done |

---

### Pipeline Integration

TDD enforcement is integrated into the **software-dev pipeline** (`src/features/builtin-skills/skills/software-dev.ts`):

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOFTWARE-DEV PIPELINE                        │
├─────────┬─────────────┬─────────────────────────────────────────┤
│ Phase   │ Role        │ TDD Integration                         │
├─────────┼─────────────┼─────────────────────────────────────────┤
│ PLAN    │ Oracle      │ Generates TDD instructions in plan      │
│ BUILD   │ Developer   │ Loads tdd-enforcer, follows RED-GREEN-REFACTOR │
│ VERIFY  │ Quality     │ Runs bun test + typecheck + lint + build│
│ REVIEW  │ 5-agent     │ Checks test coverage and quality        │
│ SECURE  │ Sentinel    │ Reviews test isolation and mocking      │
│ SHIP    │ Git-master  │ Ensures tests included in commits       │
└─────────┴─────────────┴─────────────────────────────────────────┘
```

#### Developer Agent Dispatch

```typescript
task(
  category="source",
  load_skills=["git-master", "tdd-enforcer"],
  run_in_background=true,
  description="Implement {FEATURE}",
  prompt=`Implement from plan:
{PLAN}

File: {PATH}

Follow tdd-enforcer: write test FIRST (RED), then minimum code (GREEN),
then refactor. Run bun test after each change.`
)
```

#### Tester Agent Dispatch

```typescript
task(
  category="source",
  load_skills=["tdd-enforcer", "quality-gate"],
  description="Write tests for {FEATURE}",
  prompt="..."
)
```

---

### Config Gate

The `tdd-enforcer` skill is **disabled by default**. It only activates when enabled in the matrixx config. Schema: `src/config/schema/tdd-enforcer.ts` (`TddEnforcerConfigSchema`, `enabled` defaults to `false`); wired as optional `tdd_enforcer` key in `src/config/schema/matrixx-config.ts`:

```jsonc
// matrixx.json or matrixx.jsonc
{
  "tdd_enforcer": {
    "enabled": true
  }
}
```

#### Gate Check Locations

| File | Check |
|------|-------|
| `src/plugin/skill-context.ts` | Adds `tdd-enforcer` to `disabledSkills` if not enabled |
| `src/plugin-handlers/agent-config-handler.ts` | Same gate for agent config |

#### What Happens When Disabled

- Oracle still includes TDD instructions in plans (template is static)
- Developer agent does NOT load the `tdd-enforcer` skill
- No RED-GREEN-REFACTOR enforcement at execution time
- Tests-after becomes acceptable

---

### Evidence Requirements

Task is NOT complete without:

```bash
bun test              # Must show: X tests passed, 0 failed
bun run typecheck     # Must show: exit code 0, no errors
```

**Reporting format:**

```
✅ bun test — 42 tests passed, 0 failed (3.2s)
✅ bun run typecheck — no errors
```

If ANY verification fails:
1. STOP. Do not report done.
2. Fix the failure (code, never the test).
3. Re-run ALL verification commands.
4. Report done only when ALL pass.

---

### Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Action |
|--------------|----------------|----------------|
| Write implementation THEN tests | Tests become documentation, not verification | Write failing test FIRST |
| Delete a failing test | You're hiding a problem | Fix the code to make it pass |
| Skip a failing test (`test.skip`) | Same as deleting | Fix the code |
| Write empty test body | Provides false confidence | Write real assertions |
| Only mock everything | Tests prove the mock works, not the code | Use real deps where feasible |
| Only happy-path tests | Errors happen in production | Add error/edge case tests |
| Run `bun test` once at the very end | Bugs compound | Run after each GREEN step |
| "Tests are for later" | Later never comes | Test-first, always |
| Separate test commit from impl commit | Breaks bisect, breaks CI | Same commit always |

---

### Summary Flow

```
User: "Implement feature X"
  │
  ▼
Oracle: Creates plan with TDD instructions
  │  • Test Decision: TDD enabled
  │  • Each task: RED → GREEN → REFACTOR steps
  │  • Acceptance criteria: bun test commands
  │  • QA scenarios: agent-executed verification
  │
  ▼
/start-work → Architect executes plan
  │
  ▼
Developer agent loads tdd-enforcer skill
  │  • For each file in plan:
  │    1. RED: Write failing test (bun test → FAIL)
  │    2. GREEN: Minimum code (bun test → PASS)
  │    3. REFACTOR: Clean up (bun test → PASS)
  │    4. Report evidence
  │
  ▼
Quality gate verifies
  │  • bun test — 0 failures
  │  • bun run typecheck — no errors
  │  • bun run lint — 0 issues
  │  • bun run build — success
  │
  ▼
Done ✓
```
