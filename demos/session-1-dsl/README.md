# Demo 1: Robot Mission DSL

> **Duration:** ~8-10 min · **Agent Focus:** Oracle → Architect → Cipher
> **Key Concepts:** Planning · TDD enforcement · Task Board · Quality Gates · Agent delegation

---

## The Pitch

*"Watch how Morpheus takes an ambiguous request — 'build a Robot Mission DSL' — and produces a working, tested DSL with zero human intervention. Oracle plans it, Architect executes, Cipher builds the grammar with TDD, and quality gates verify every step."*

---

## Preparation

This directory is your starting point. `robot-dsl/` is empty — everything is built from scratch during the demo.

```bash
cd demos/session-1-dsl/robot-dsl
# That's it. Start OpenCode here.
```

---

## Script

### Step 1: The User Request (0:00-0:30)

Open OpenCode in `robot-dsl/` and type:

```
I want to build a Robot Mission DSL in Python using textX.
The DSL should support:
- Navigate tasks:  `task navigate to(x, y)`
- Scan tasks:      `task scan area(radius=N)`
- Collect tasks:   `task collect sample at(x, y)`
- Return tasks:    `task return to base`

Missions group tasks: `mission Name { ... }`
The DSL should generate executable Python code.

Write a test first, use TDD. Quality gates must pass.
```

**🎙️ HINT:** *"This is an ambiguous, open-ended request. Watch how Oracle handles it."*

### Step 2: Oracle Planning (0:30-2:00)

> **Behind the scenes:**
> 1. Morpheus detects this is a complex task → invokes **Oracle**
> 2. Oracle analyzes → identifies gaps → fires **Seraph** for pre-planning (gap analysis)
> 3. Oracle creates a structured plan with wave-based parallel execution
> 4. Optionally consults **Smith** for plan validation (high-accuracy mode)
> 5. Populates the task board via `todowrite()`

**Audience sees:** Oracle's plan with:
- TL;DR with deliverables and effort estimate
- Work Objectives with Definition of Done
- Execution Strategy (Wave 1: grammar, Wave 2: codegen, Wave 3: integration)
- 6-8 TODOs each with agent profile + TDD requirements + acceptance criteria

```
┌────────────────────────────────────────────────────┐
│  ORACLE WORK PLAN                                  │
│  TL;DR: Build textX DSL → Python code generator    │
│                                                    │
│  Wave 1: Grammar design + pytest infrastructure    │
│  Wave 2: Code generator + test suite               │
│  Wave 3: Integration test + end-to-end validation  │
│                                                    │
│  TODO [1] Setup textX + pytest infrastructure      │
│  TODO [2] Write failing grammar test (RED)         │
│  TODO [3] Implement textX grammar (GREEN)          │
│  ...                                                │
└────────────────────────────────────────────────────┘
```

**🎙️ HINT:** *"Before a single line of code, Oracle creates the full plan, registers todos, and delegates Seraph for gap analysis. The task board is populated with atomic, verifiable items."*

### Step 3: Architect Executes — Cipher Deployed (2:30-5:00)

User runs: `/start-work`

> **Behind the scenes:**
> - `/start-work` hook creates `.matrixx/mission.json` and switches session agent to `architect`
> - Architect reads the plan, iterates through TODOs
> - Infrastructure (Task 1): dispatched to `mouse` agent
> - Grammar (Tasks 2-3): dispatched to `cipher` — the DSL specialist

**Audience sees:**
```
[Architect] Starting Wave 1...
[Architect] Task 1: Delegating infrastructure setup → mouse agent
[Architect] ✓ Setup complete (pytest + textX installed)
[Architect] Task 2: Delegating grammar design → cipher agent
  └── Cipher loaded with skills: dsl-core, dsl-metamodel, dsl-testing
```

**Cipher in action** (TDD enforced):

1. Writes a FAILING test first:
```python
def test_parse_mission_with_navigate():
    model = parse_mission("mission Test { task navigate to(10, 20) }")
    assert model.name == "Test"
    assert len(model.tasks) == 1
    assert isinstance(model.tasks[0], NavigateTask)
```

2. Runs test → **RED** (expected — no implementation yet)

3. Implements the textX grammar:
```
MissionModel:
    'mission' name=ID '{'
        tasks*=Task
    '}'
;
Task: NavigateTask | ScanTask | CollectTask | ReturnTask;
NavigateTask: 'task' 'navigate' 'to' '(' x=INT ',' y=INT ')';
ScanTask: 'task' 'scan' 'area' '(' 'radius' '=' radius=INT ')';
CollectTask: 'task' 'collect' 'sample' 'at' '(' x=INT ',' y=INT ')';
ReturnTask: 'task' 'return' 'to' 'base';
```

4. Runs test → **GREEN**

**🎙️ HINT:** *"Cipher is our DSL engineering specialist. It auto-loads textX/metamodel/testing skills and follows TDD — RED-GREEN-REFACTOR — without being reminded."*

### Step 4: Quality Gates (5:00-6:00)

> **Behind the scenes:** After each write, quality-gate hook runs `npx biome check`. TDD enforcer skill runs `pytest`.

```
[quality-gate] Running verification...
  ✓ pytest: 4 passed, 0 failed
  ✓ typecheck: no errors  
  ✓ lint: clean
[quality-gate] All checks PASSED
```

**🎙️ HINT:** *"Quality gates run automatically after every write operation. Lint, type checks, test execution — all enforced by hooks, not by discipline."*

### Step 5: Demo Payoff (6:00-7:00)

```bash
$ cat mission.txt
mission SurveyArea {
    task navigate to(10, 20)
    task scan area(radius=5)
    task collect sample at(15, 25)
    task return to base
}

$ python -m robot_dsl mission.txt
🚀 Mission 'SurveyArea' executing...
  → Navigating to (10, 20)
  → Scanning area (radius=5)
  → Collecting sample at (15, 25)
  → Returning to base
✅ Mission complete.
```

**🎙️ HINT:** *"From an ambiguous request to a working, tested DSL — in minutes, with zero human coding."*

---

## Automation in Action (Behind the Scenes)

| What Happens | Who Does It | Visible To Audience |
|---|---|---|
| Task complexity detected | Morpheus | — |
| Pre-planning gap analysis | Seraph (sub-agent) | Seraph report |
| Structured plan + todos | Oracle | Plan markdown + task board |
| Plan validation | Smith (optional) | Validation report |
| Mission activation | `/start-work` hook | Agent switch to architect |
| Infrastructure setup | mouse agent | CLI output |
| Grammar (TDD RED→GREEN) | cipher agent | Test output + code |
| Code generation (TDD) | cipher agent | Test output + code |
| Quality verification | quality-gate hook | Lint/test results |
| Task progress tracking | Task board | `todoread` output |

---

## Key Points

| Highlights | Why It Matters |
|---|---|
| Oracle auto-creates plans from ambiguous requests | Maps to MDE/DSL work — formal plans from informal specs |
| Cipher specialist with 11 DSL skills | Directly relevant to Model-Driven Engineering |
| TDD enforced at agent level (RED→GREEN→REFACTOR) | Relevant to Software Quality research |
| Task board gives full transparency | Relevant to Software Engineering process |
| Quality gates run automatically on every write | Relevant to Software Quality domain |
| Todo continuation enforcer (2s countdown) | Tasks never abandoned — relentless completion |
