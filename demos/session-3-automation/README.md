# Demo 3: Full Automation Pipeline

> **Duration:** ~8-10 min · **Orchestrator:** Morpheus
> **Key Concepts:** Seraph→Oracle→Smith pre-planning · Parallel agent swarms · Full TDD · Quality + Security gates
> **Demo payoff:** One sentence → shipped, tested, secure REST API

---

## The Pitch

*"This is the flagship demo — the complete Morpheus vision. One ambiguous sentence goes in; a working, tested, security-hardened REST API comes out. Seraph catches ambiguities, Oracle plans it, Smith validates, Morpheus orchestrates parallel agent swarms, and hooks guarantee quality and security at every step."*

---

## Preparation

`task-api/` is empty — everything is built from scratch during the demo.

```bash
cd demos/session-3-automation/task-api
# Start OpenCode here.
```

---

## Script

### Step 1: The One-Liner Request (0:00-0:30)

Open OpenCode in `task-api/` and type:

```
Build a Task Manager REST API in Python with FastAPI + SQLite.
CRUD operations, input validation (Pydantic), unit tests with pytest,
and security hardening. Use the full software development pipeline.
```

**🎙️ HINT:** *"This is the ultimate test — one sentence to a fully built, tested, secure API. Watch the entire Morpheus pipeline unfold."*

### Step 2: Pre-Planning Phase — Seraph + Oracle + Smith (0:30-2:00)

> **Behind the scenes:**
> 1. Morpheus detects complexity → fires **Seraph** (pre-planning consultant)
> 2. Seraph identifies scope ambiguities, risks, and gaps
> 3. **Oracle** generates a complete plan with 3 waves + 10+ atomic tasks
> 4. **Smith** validates the plan for completeness and verifiability

**Audience sees:**
```
[Seraph] Pre-planning analysis...
  → Ambiguity: Task model fields not specified
  → Risk: No auth strategy mentioned  
  → Gap: No deployment target specified
  → Resolution: Assuming title+description+status+created_at, no auth for demo, local dev

[Oracle] Generating work plan...
  Wave 1: Project scaffold + test infrastructure + model
  Wave 2: CRUD endpoints (parallel: 3 agents for 4 endpoints)
  Wave 3: Security hardening + integration test + quality gate
  
[Smith] Validating plan...
  → All tasks have agent-executable acceptance criteria ✓
  → TDD mandated for all implementation tasks ✓
  → No human-dependent verification ✓
  ✓ Plan validated.
```

**🎙️ HINT:** *"Seraph catches the ambiguities before a single line of code is written. Oracle builds the plan. Smith validates it. Three layers of planning rigor before execution begins."*

### Step 3: Parallel Agent Swarm Execution (2:00-6:00)

User runs: `/start-work`

> **Behind the scenes:** Morpheus orchestrates parallel waves via the task system:

**Wave 1** — Infrastructure (one `mouse` agent):
- `poetry init`, FastAPI + pytest + httpx installed
- `conftest.py` with test client fixture
- Database setup with SQLAlchemy

**Wave 2** — CRUD Endpoints (3 agents in PARALLEL via `run_in_background=true`):
- Agent A: Task model + Pydantic schemas (with TDD)
- Agent B: Create + List endpoints (with TDD)
- Agent C: Get + Update + Delete endpoints (with TDD)

**Audience sees:**
```
[Morpheus] Wave 1: Infrastructure setup
  ✓ mouse: Project scaffold complete

[Morpheus] Wave 2: Parallel execution
  ├── ⏳ Agent A: Task model (TDD)...
  │     ✓ RED: test_task_model.py fails (no impl)
  │     ✓ GREEN: model implemented, tests pass
  ├── ⏳ Agent B: Create + List (TDD)...
  │     ✓ RED: test_create_task fails
  │     ✓ GREEN: POST /tasks + GET /tasks working
  └── ⏳ Agent C: Get + Update + Delete (TDD)...
        ✓ RED: test_update_task fails
        ✓ GREEN: all endpoints working
        
  All 3 agents completed in parallel. ~60% time saved.
```

**🎙️ HINT:** *"This is the power of parallel delegation. Three agents working simultaneously — each following TDD independently. Morpheus coordinates, never bottlenecks."*

### Step 4: Security Scan + Quality Gates (6:00-7:00)

> **Behind the scenes:** After all code is written:
> 1. Sentinel scans for vulnerabilities (automatic from security hook)
> 2. Quality gates run (lint + typecheck + test + build)
> 3. Results are aggregated

```
[Sentinel] Security scan...
  → 0 CRITICAL, 0 HIGH, 1 MEDIUM (missing CORS config)
  → Recommendation: Add CORSMiddleware

[quality-gate] Running full verification...
  ✓ pytest: 12 passed, 0 failed
  ✓ mypy: no type errors
  ✓ ruff lint: clean
  ✓ build: passes
```

**🎙️ HINT:** *"Sentinel and quality-gate are hooks — they run automatically after every code change. No one needs to remember to run tests."*

### Step 5: The Demo Payoff (7:00-8:00)

```bash
# Start the API
$ uvicorn app.main:app --reload

# Test it
$ curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Demo task", "description": "Showing Matrixx"}'

{"id":1,"title":"Demo task","description":"Showing Matrixx","status":"todo","created_at":"..."}

$ curl http://localhost:8000/tasks
[{"id":1,"title":"Demo task",...}]
```

**🎙️ HINT:** *"One sentence → shipped, tested, secure REST API. Zero human coding. That's Morpheus."*

---

## The Complete Pipeline

```
User Request (one sentence)
    │
    ▼
┌─────────────────────────────┐
│  Seraph (gap analysis)      │  ← Pre-planning consultant
├─────────────────────────────┤
│  Oracle (plan generation)   │  ← Creates structured plan + todos
├─────────────────────────────┤
│  Smith (plan validation)    │  ← Validates completeness
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  /start-work (activation)   │  ← Creates mission state
├─────────────────────────────┤
│  Architect (orchestration)  │  ← Reads plan, iterates TODOs
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Wave 1: mouse agent        │  ← Infrastructure (serial)
├─────────────────────────────┤
│  Wave 2: 3 agents parallel  │  ← CRUD endpoints (TDD each)
├─────────────────────────────┤
│  Wave 3: Sentinel + QA      │  ← Security + quality gates
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│  Working API + tests        │  ← Delivered to user
└─────────────────────────────┘
```

---

## Under the Hood

| What Happens | Responsible Component | Source Location |
|---|---|---|
| Ambiguity detection | Seraph agent | `src/agents/seraph/` |
| Plan generation | Oracle agent | `src/agents/oracle/` (8 files, ~1500 LOC) |
| Plan validation | Smith agent | `src/agents/smith/` |
| Mission activation | start-work hook | `src/hooks/start-work/` |
| Task orchestration | Architect hook | `src/hooks/architect/` (17 files) |
| Parallel task execution | Task system (background) | `src/tools/task/` |
| TDD enforcement | tdd-enforcer skill | `src/features/builtin-skills/skills/tdd-enforcer.ts` (317 LOC) |
| Auto lint after writes | quality-gate hook | `src/hooks/quality-gate/hook.ts` |
| Security scan | Sentinel agent | `src/agents/sentinel/` |
| Todo continuation | todo-continuation-enforcer | `src/hooks/todo-continuation-enforcer/` (14 files) |
| Context recovery | anthropic-context-recovery | `src/hooks/anthropic-context-window-limit-recovery/` (25 files, 2232 LOC) |

---

## Key Points

| Highlights | Why It Matters |
|---|---|
| Seraph → Oracle → Smith pre-planning pipeline | 3-phase planning prevents downstream failures |
| Parallel agent execution (~60% time savings) | Engineering process efficiency |
| Full TDD enforcement across all agents | Software Quality — no exceptions |
| Automated security + quality gates | No human remembers — hooks enforce |
| One sentence → shipped, tested, secure API | The Morpheus automation promise |
