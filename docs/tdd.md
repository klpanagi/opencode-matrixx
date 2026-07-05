# TDD Architecture — Planning & Enforcement

## TL;DR

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

## Architecture Overview

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

## Layer 1: Oracle — Planning TDD

Oracle enforces TDD through the **plan template** (`src/agents/oracle/plan-template.ts`). When generating a work plan, Oracle includes TDD instructions in every task.

### Test Decision Block

Every plan includes a test decision section:

```markdown
### Test Decision
- **Infrastructure exists**: [YES/NO]
- **Automated tests**: [TDD / Tests-after / None]
- **Framework**: [bun test / vitest / jest / pytest / none]
```

### If TDD Is Enabled

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

### Per-Task Acceptance Criteria

Each task's acceptance criteria includes TDD-specific verification:

```markdown
**If TDD (tests enabled):**
- [ ] Test file created: src/auth/login.test.ts
- [ ] Test covers: successful login returns JWT token
- [ ] bun test src/auth/login.test.ts → PASS (3 tests, 0 failures)
```

### Agent-Executed QA Scenarios

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

## Layer 2: tdd-enforcer — Execution Enforcement

The `tdd-enforcer` skill (`src/features/builtin-skills/skills/tdd-enforcer.ts`) is loaded by the Developer agent at execution time. It enforces the RED-GREEN-REFACTOR cycle defined in the plan.

### Prime Directive

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

### RED-GREEN-REFACTOR Cycle

```
RED     → Write a test. Run it. It MUST fail (for the right reason).
GREEN   → Write minimum code to make that test pass. No more.
REFACTOR → Clean up code. Tests MUST stay green throughout.
```

### Self-Check Gates

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

### Test Conventions

| Convention | Rule |
|------------|------|
| **File placement** | `src/foo/bar.ts` → `src/foo/bar.test.ts` (alongside source) |
| **BDD markers** | `//#given` / `//#when` / `//#then` in every test case |
| **Imports** | `import { describe, test, expect } from "bun:test"` |
| **Evidence** | `bun test` + `bun run typecheck` must pass before marking done |

---

## Pipeline Integration

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

### Developer Agent Dispatch

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

### Tester Agent Dispatch

```typescript
task(
  category="source",
  load_skills=["tdd-enforcer", "quality-gate"],
  description="Write tests for {FEATURE}",
  prompt="..."
)
```

---

## Config Gate

The `tdd-enforcer` skill is **disabled by default**. It only activates when enabled in the matrixx config:

```jsonc
// matrixx.json or matrixx.jsonc
{
  "tdd_enforcer": {
    "enabled": true
  }
}
```

### Gate Check Locations

| File | Check |
|------|-------|
| `src/plugin/skill-context.ts` | Adds `tdd-enforcer` to `disabledSkills` if not enabled |
| `src/plugin-handlers/agent-config-handler.ts` | Same gate for agent config |

### What Happens When Disabled

- Oracle still includes TDD instructions in plans (template is static)
- Developer agent does NOT load the `tdd-enforcer` skill
- No RED-GREEN-REFACTOR enforcement at execution time
- Tests-after becomes acceptable

---

## Evidence Requirements

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

## Anti-Patterns

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

## Summary Flow

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
