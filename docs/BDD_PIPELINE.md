# BDD Pipeline — Agent-Driven Implementation

> **Status**: ✅ Implemented & Verified (`feat/bdd` branch)
> **Package**: `opencode-matrixx` (v2.1.0)
> **Context**: Native matrixx feature — no Python, no external bundling

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [Architecture Overview](#architecture-overview)
3. [Pipeline Flow](#pipeline-flow)
4. [Available Slash Commands](#available-slash-commands)
5. [Example Walkthrough](#example-walkthrough)
6. [Agent Reference](#agent-reference)
7. [Technical Details](#technical-details)
8. [Getting Started](#getting-started)

---

## What It Is

| The BDD Pipeline is a **first-class feature in matrixx** that transforms Gherkin `.feature` files into production-ready artifacts through AI agents. Given a feature file, the pipeline produces:

- **📋 Contract JSON** — Structured, schema-validated representation of the feature
- **🧪 Tests** — Cucumber step definitions + page objects (E2E test suite)
- **🎨 Frontend** — React components derived from UI annotations
- **⚙️ Backend** — Typed API services with Zod validation

| All of this is driven by matrixx's built-in agents and skills — no human-in-loop required. The `bdd-contract` agent enriches the parsed Contract, and **Morpheus** (with `bdd-frontend`, `bdd-backend`, `bdd-tests` skills) generates the test, frontend, and backend artifacts. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Gherkin .feature file                     │
│    (login.feature, checkout.feature, api-pagination.feature) │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Deterministic Tools                        │
│                                                               │
│  bdd_parse_gherkin     →  AST from @cucumber/gherkin          │
│  bdd_create_contract   →  AST → Contract JSON (Zod v4)        │
│                                                               │
│  These are TDD-tested, deterministic, no LLM involved.         │
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

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No Python** | Pure TypeScript/Node.js — consistent with matrixx stack |
| **No `stories_2_tdd` bundling** | Agents do the work natively; no legacy code import |
| **5 separate slash commands** | No subcommand routing infrastructure needed |
| **Deterministic tools first, agents second** | Tools (bdd_parse_gherkin, bdd_create_contract) do the parsing work; agents enrich on top |
|| **1 new EXPENSIVE agent** | `bdd-contract` is the only specialist — Morpheus (the matrixx orchestrator) handles tests/frontend/backend via skills |

---

## Pipeline Flow

### Step-by-Step Data Flow

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

## Available Slash Commands

There are **5 slash commands**, each accessible from the matrixx chat prompt:

### 1. `/bdd-contract <feature-path> [--force]`

**Purpose**: Parse a `.feature` file and produce a Contract JSON.

```
/bdd-contract src/features/bdd/fixtures/login.feature
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
  "sourceFile": "src/features/bdd/fixtures/login.feature",
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

### 2. `/bdd-tests <contract.json>`

**Purpose**: Generate Cucumber step definitions + page objects from a Contract JSON.

```
/bdd-tests src/features/bdd/fixtures/login.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-tests` skill (loaded into Morpheus) generates `*.steps.ts` files (Given/When/Then implementations)
3. Generates page object files (encapsulating UI interactions)
4. You run tests with `npx cucumber-js`

**Output**: Step definition files + page object files

### 3. `/bdd-frontend <contract.json>`

**Purpose**: Generate React components from a Contract JSON (using `@ui:*` annotations).

```
/bdd-frontend src/features/bdd/fixtures/login.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-frontend` skill (loaded into Morpheus) generates React components
3. Uses `@ui:route`, `@ui:testid`, `@ui:string` annotations to drive component design
4. Generates functional React components

**Output**: `.tsx` component files

### 4. `/bdd-backend <contract.json>`

**Purpose**: Generate typed API services from a Contract JSON (using `@api:*` annotations).

```
/bdd-backend src/features/bdd/fixtures/login.contract.json
```

**What happens**:
1. Reads the Contract JSON
2. The `bdd-backend` skill (loaded into Morpheus) generates typed service files
3. Uses `@api:endpoint` and `@api:response` annotations for request/response types
4. Uses Zod schemas for runtime validation

**Output**: `.ts` service files with Zod schemas

### 5. `/bdd-pipeline <feature-path> [--force]`

**Purpose**: Run the full pipeline end-to-end — all 4 steps in sequence.

```
/bdd-pipeline src/features/bdd/fixtures/login.feature
```

**Pipeline Steps**:
1. `/bdd-contract` — Parse feature → generate Contract JSON
2. `/bdd-tests` — Generate Cucumber step definitions + page objects
3. `/bdd-frontend` — Generate React components
4. `/bdd-backend` — Generate typed API services

**Output**: All 4 artifacts produced in a single orchestrated run

---

## Example Walkthrough

### Starting Point: `login.feature`

```gherkin
# @ui:testid form=login-form-component
# @api:endpoint POST /api/v1/auth/login
# @state:initial session=new-session-init
Feature: User Login
  As a registered user
  I want to log in with my credentials
  So that I can access my account dashboard

  # @ui:testid button=login-submit-button
  Scenario: Successful login with valid credentials
    Given the user is on the login page
    When the user enters "alice@example.com" as the email
    And the user enters "securePass123" as the password
    Then the user should be redirected to the dashboard
    And a welcome message should be displayed
```

### Step 1: `/bdd-contract login.feature`

Produces `login.contract.json` — a structured representation containing:
- Feature metadata (name, description)
- All scenarios with their steps
- Extracted annotations grouped by type (`api`, `ui`, `state`, `assumptions`)
- `schemaVersion: 1` for future compatibility

### Step 2: `/bdd-tests login.contract.json`

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

### Step 3: `/bdd-frontend login.contract.json`

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

### Step 4: `/bdd-backend login.contract.json`

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

## Agent Reference

### New Agent (1 EXPENSIVE)

| Agent | Cost | Mode | Skill | Purpose |
|-------|------|------|-------|---------|
| **bdd-contract** | EXPENSIVE | `all` | `bdd-contract` | Enrich parsed Contract JSON with business semantics, naming, and intent |

### Reused Agent

| Agent | Skills Loaded | Purpose |
|-------|---------------|---------|
| **Morpheus** (existing) | `bdd-frontend`, `bdd-backend`, `bdd-tests` | Generates React components, Cucumber step defs, and typed API services from Contract JSON |

### Existing Specialist (Frontend)

| Agent | Skill Loaded | Purpose |
|-------|---------------|---------|
| **Sati** (existing) | `bdd-frontend` (alt path) | Same `bdd-frontend` skill — Sati remains a valid invocation target for React-specific work |

### Existing Agent (Reused)

| Agent | Skill Loaded | Purpose |
|-------|-------------|---------|
| **Sati** (existing) | `bdd-frontend` | Generate React components from Contract `@ui:*` annotations |

### Agent Architecture

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

## Technical Details

### Contract JSON Schema (v1)

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

### Annotation Types

| Annotation Prefix | Fields | Purpose |
|-------------------|--------|---------|
| `# @api:endpoint METHOD /path` | endpoints[] | API endpoint definitions |
| `# @api:response STATUS json` | responses[] | Expected API responses |
| `# @ui:route key=value` | routes[] | Frontend route mappings |
| `# @ui:testid key=value` | testIds[] | Test ID selectors for components |
| `# @ui:string category.key=value` | strings[] | UI copy/text strings |
| `# @state:variable name type default` | variables[] | State variables |
| `# @state:initial=value` | initial[] | Initial state values |
| `# @state:precondition=value` | preconditions[] | Preconditions for scenarios |
| `# @assumption: text` | assumptions[] | Business assumptions captured |

### Deterministic Tools

**`bdd_parse_gherkin`**
- Input: `.feature` file path
- Output: JSON-serialized GherkinDocument AST
- Uses: `@cucumber/gherkin` `generateMessages()` with `SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN`
- TDD: 6 tests (valid file, missing file, malformed, sourceMap toggle, empty file)

**`bdd_create_contract`**
- Input: parsed AST JSON + source file path + source text + options
- Output: JSON Contract file written to disk
- Steps: walks GherkinDocument AST, extracts annotations via `parseAnnotations()`, validates against `ContractSchema`
- TDD: 8 tests (valid contract, schema validation, force flag, malformed input, data tables, outlines, rules)

### Guardrails (Must NOT Have)

| Guardrail | Enforced |
|-----------|----------|
| ❌ No Python files | ✓ 0 Python files added |
| ❌ No stories_2_tdd imports | ✓ None |
| ❌ No new MCP servers | ✓ None |
| ❌ No new hooks | ✓ None |
| ❌ No auto-installation of test runners | ✓ User runs `bun install` themselves for cucumber |
| ❌ No new specialist agents for tests/frontend/backend | ✓ These run via Morpheus + bdd-* skills (single-source-of-truth consolidation) |
| ❌ No subcommand routing | ✓ 5 separate commands |

### Fixtures

3 `.feature` files of increasing complexity for testing and development:

| Fixture | Complexity | Key Features |
|---------|-----------|--------------|
| `login.feature` | Simple | Single scenario, 5 steps, Given/When/Then/And |
| `checkout.feature` | Medium | Background, Scenario Outline + Examples, Data Table |
| `api-pagination.feature` | Complex | 2 Rule blocks, Doc Strings, And/But keywords |

---

## Getting Started

### Prerequisites

- matrixx (opencode-matrixx v2.1.0+)
- `@cucumber/gherkin` (bundled dependency — auto-installed with matrixx)
- `@cucumber/cucumber` and `@playwright/test` (user-installed per project)

### Running the Pipeline

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

### Writing Good Feature Files

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

### Verification

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

## Implementation Stats

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

## File Map

```
src/
├── features/bdd/
│   ├── schema.ts              ← Contract JSON v1 Zod schema
│   ├── types.ts               ← Re-exported TypeScript types
│   ├── annotations.ts         ← Gherkin comment annotation parser
│   ├── fixtures/
│   │   ├── login.feature      ← Simple fixture
│   │   ├── checkout.feature   ← Medium fixture
│   │   └── api-pagination.feature ← Complex fixture
│   └── __tests__/
│       ├── schema.test.ts     ← 9 schema tests
│       └── annotations.test.ts ← 14 annotation parser tests
├── tools/
│   ├── bdd-parse-gherkin/     ← bdd_parse_gherkin tool (6 tests)
│   └── bdd-create-contract/   ← bdd_create_contract tool (8 tests)
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
