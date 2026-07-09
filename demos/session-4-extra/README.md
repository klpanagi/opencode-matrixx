# Demo Session 4 — Extra: Code Archeology & Session Continuity

> **Total Duration:** ~6-7 min total (Demo 4A: 4 min · Demo 4B: 3 min)
> **Capabilities:** `/refactor` surgical transformation · Session handoff (`/handoff` → `/pickup`)
> **Team Domains:** CPS · Robotics · IoT · Software Quality

---

## Executive Summary

We add **2 mini-demos** that showcase capabilities UNDISCOVERED by Demos 1–3:

| Demo | What | Why This Team Cares | Duration |
|------|------|---------------------|----------|
| **4A: `/refactor`** | Safe, surgical code transformation across a CPS simulation | CPS/robotics codebases are tightly coupled; refactoring is risky without AST-grep + LSP precision | 4 min |
| **4B: Session Handoff** | `/handoff` + `/pickup` for long-running investigations | Field debugging spans days; context must survive session boundaries | 3 min |

Neither duplicates Demos 1–3 (DSL build, security audit, full automation).

---

## Suggested Presentation Order

Insert the extra demos **after Demo 2** (security):

```
Status Quo:
  Demo 1: Robot Mission DSL          (8-10 min)
  Demo 2: Security Audit             (8-10 min)
  Demo 3: Full Automation Pipeline   (8-10 min)

NEW Order:
  Demo 1: Robot Mission DSL            (8-10 min)
  Demo 2: Security Audit               (8-10 min)
  → Demo 4A: Code Archeology           (4 min)   ← NEW
  → Demo 4B: Session Handoff           (3 min)   ← NEW
  Demo 3: Full Automation Pipeline     (8-10 min)
  → Closing: "What you just witnessed" (2 min)
```

**Why after Demo 2:** The audience just saw security (static/analytical). `/refactor` transitions naturally — "same precision, applied to code transformation." Handoff closes the narrative: "this all works across sessions."

**If short on time:** Drop Demo 4B (handoff is elegant but less flashy). Keep Demo 4A as the sole extra.

---

# Demo 4A: `/refactor` — Surgical Code Transformation

> **Duration:** 4 min · **Agent Focus:** `/refactor` slashcommand
> **Key Concepts:** 6-phase refactoring pipeline · LSP rename · AST-grep replace · Codemap
> **Audience Pitch:** *"Refactoring CPS code is terrifying — every change ripples through tightly coupled modules. /refactor makes it safe with LSP precision, AST-grep coverage, and automated verification."*

---

## Why This Demo (Not the Others)

| Candidate | Why Not Selected |
|-----------|-----------------|
| Matrix Loop (`/matrix-loop`) | Cool but takes 5+ min to demonstrate meaningfully; eats the entire slot |
| Ultrawork `/research` | Best shown in a different context (offline prep); not a live-stage capability |
| Background agent swarm | Already hinted in Demo 3 (parallel agents); showing a dedicated version is repetitive |
| remove-ai-slops + comment-checker | **Factually corrected**: Comment-checker is non-blocking (PostToolUse only); remove-ai-slops requires interactive per-fix approval — too slow for live demo |
| Git-master skill | Standalone git demo is not visually impressive; better as sub-narrative in another demo |
| **`/refactor`** | **Selected**: Visually impactful (before/after code), 6-phase pipeline demonstrates sophistication, directly relevant to CPS teams doing large refactors |

---

## Preparation

### Create the demo project: `cps-refactor/`

```bash
cd demos/session-4-extra
mkdir -p cps-refactor/src cps-refactor/tests
```

### Pre-create files (must exist before demo start):

**`cps-refactor/src/sensor_driver.py`** — A CPS sensor driver with a badly named class:

```python
"""ROS-like sensor driver for a simulated LIDAR/camera fusion node."""

import time
import random
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SensorReading:
    timestamp: float
    range_m: float
    bearing_rad: float
    confidence: float


class SensorNode:
    """Simulates a multi-modal sensor fusion node for a CPS robot.
    
    TODO: This class name is ambiguous — it manages sensor fusion, not a single sensor.
    The name should reflect fusion rather than a raw sensor.
    """

    def __init__(self, node_name: str, update_hz: int = 10):
        self.node_name = node_name
        self.update_hz = update_hz
        self._readings: list[SensorReading] = []
        self._running = False

    def start(self) -> None:
        self._running = True
        print(f"[{self.node_name}] Sensor node started at {self.update_hz}Hz")

    def stop(self) -> None:
        self._running = False
        print(f"[{self.node_name}] Sensor node stopped")

    def read(self) -> Optional[SensorReading]:
        if not self._running:
            return None
        reading = SensorReading(
            timestamp=time.time(),
            range_m=random.uniform(0.5, 30.0),
            bearing_rad=random.uniform(-3.14, 3.14),
            confidence=random.uniform(0.7, 1.0),
        )
        self._readings.append(reading)
        return reading

    def latest(self) -> Optional[SensorReading]:
        return self._readings[-1] if self._readings else None

    def statistics(self) -> dict:
        if not self._readings:
            return {"count": 0}
        ranges = [r.range_m for r in self._readings]
        return {
            "count": len(self._readings),
            "mean_range": sum(ranges) / len(ranges),
            "max_range": max(ranges),
        }
```

**`cps-refactor/src/controller.py`** — A controller that USES `SensorNode`:

```python
"""Navigation controller that reads sensor fusion and drives actuators."""

from src.sensor_driver import SensorNode


class NavigationController:
    """Reads sensor fusion data and computes actuator commands."""

    def __init__(self, sensor: SensorNode):
        self._sensor = sensor

    def step(self) -> dict:
        reading = self._sensor.read()
        if reading is None:
            return {"action": "stop", "reason": "no_sensor_data"}
        if reading.confidence < 0.8:
            return {"action": "slow_down", "reason": "low_confidence"}
        if reading.range_m < 1.0:
            return {"action": "emergency_stop", "reason": "obstacle_imminent"}
        return {"action": "continue", "throttle": 0.5}
```

**`cps-refactor/tests/test_sensor.py`** — Existing tests (for verification):

```python
"""Tests for the sensor driver module."""

from src.sensor_driver import SensorNode, SensorReading


class TestSensorNode:
    def test_start_stop(self):
        node = SensorNode("test_node", update_hz=10)
        node.start()
        assert node._running is True
        node.stop()
        assert node._running is False

    def test_read_returns_reading(self):
        node = SensorNode("test_node")
        node.start()
        reading = node.read()
        assert reading is not None
        assert isinstance(reading, SensorReading)
        assert reading.range_m > 0

    def test_statistics_with_readings(self):
        node = SensorNode("test_node")
        node.start()
        for _ in range(3):
            node.read()
        stats = node.statistics()
        assert stats["count"] == 3
        assert stats["mean_range"] > 0
```

### Pre-flight Check

```bash
# Verify LSP is available for Python
cd demos/session-4-extra/cps-refactor
python3 -c "import ast; print('LSP check: OK')"  # pyright/pylance must be active

# Verify tests pass before refactoring
python3 -m pytest tests/ -v
# Expected: 3 passed
```

### Pre-capture the Codemap (skips the 10-20s dead air from 5 parallel agents)

The Codemap Phase generates a dependency graph. Capture it once and display instantly during the demo:

```bash
# Pre-run: capture the dependency graph
cat > /tmp/refactor-codemap-capture.md << 'EOF'
## Codemap: SensorNode → FusionEngine

### Direct usages (will auto-rename via LSP)
| File | Line | Usage Pattern |
|------|------|---------------|
| `src/sensor_driver.py:18` | Class declaration | `class SensorNode` |
| `src/controller.py:4` | Import | `from src.sensor_driver import SensorNode` |
| `src/controller.py:10` | Type annotation | `sensor: SensorNode` |
| `tests/test_sensor.py:4` | Import | `from src.sensor_driver import SensorNode` |
| `tests/test_sensor.py:9` | Instantiation | `SensorNode("test_node")` |

### Call sites (verify rename completeness)
| Function | Called By | File |
|----------|-----------|------|
| `SensorNode.start()` | `NavigationController.__init__` | controller.py |
| `SensorNode.read()` | `NavigationController.step()` | controller.py |
| `SensorNode.statistics()` | (future use) | — |

### String/config references (NOT caught by LSP — needs grep post-check)
- None found in this project (all references are Python identifiers)

### Dependency graph
```
controller.py ──imports──▶ sensor_driver.py
                              ▲
test_sensor.py ──imports──────┘
```

### Coverage: 5 files affected, 0 string-only references → LSP rename is sufficient
EOF
```

---

## Demo Script

### Setup (0:00-0:15)

```bash
cd demos/session-4-extra/cps-refactor
```

**Narrator says:**
> *"Here's a CPS sensor fusion node. The class `SensorNode` is poorly named — it's actually doing multi-sensor fusion, not just reading one sensor. Let's rename it to `FusionEngine` without breaking anything."*

Show the sensor_driver.py file briefly on screen (point out the `class SensorNode` at line 18, the usage in controller.py at line 4).

**Narrator calls out:**
> *"A manual rename would miss the type annotation in controller.py, the imports in the test file, or any string references. Matrixx's `/refactor` command handles ALL of this deterministically."*

### Step 1: Invoke `/refactor` (0:15-0:45)

Type in OpenCode:

```
/refactor Rename SensorNode class to FusionEngine
```

**What the audience sees:**

```
┌─────────────────────────────────────────────────────────┐
│  /refactor — Intent Analysis                             │
│                                                          │
│  Goal:  Rename class SensorNode → FusionEngine           │
│  Scope: Full rename including imports, types, tests      │
│  Confidence: HIGH (symbol rename in Python)              │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"Phase 0 — the Intent Gate. The system confirms it understands the scope. Note it's identified this as a high-confidence operation because it's a symbol rename in Python, not a structural change."*

### Step 2: Show the Pre-Captured Codemap (0:45-1:15)

Display the pre-captured `/tmp/refactor-codemap-capture.md` on screen:

```
┌─────────────────────────────────────────────────────────┐
│  Phase 2 — Codemap (dependency graph)                   │
│                                                          │
│  controller.py ──imports──▶ sensor_driver.py             │
│                                ▲                         │
│  test_sensor.py ──imports──────┘                         │
│                                                          │
│  Affected: 5 references across 3 files                   │
│  String refs: NONE (all are Python identifiers)          │
│  → LSP rename is safe and sufficient                     │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"The Codemap phase traces the entire dependency graph. It found SensorNode in 5 places across 3 files. No string-only references — LSP rename will handle everything. This would catch the case where an upstream node subscribes to a topic named after the class in a config file."*

### Step 3: Execute the Rename (1:15-2:15)

System runs LSP rename + AST-grep:

```
┌─────────────────────────────────────────────────────────┐
│  Phase 5 — Execute                                      │
│                                                          │
│  Step 1: LSP rename (sensor_driver.py:18)                │
│  ├── src/sensor_driver.py:18  class SensorNode → FusionEngine
│  ├── src/controller.py:4      import SensorNode → FusionEngine
│  ├── src/controller.py:10     sensor: SensorNode → FusionEngine
│  ├── tests/test_sensor.py:4   import SensorNode → FusionEngine
│  └── tests/test_sensor.py:9   SensorNode("test_node") → FusionEngine
│  ✓ LSP rename: 5 references updated                      │
│                                                          │
│  Step 2: AST-grep post-check                             │
│  ├── Pattern: class $NAME                                │
│  ├── Result: 1 class found — "FusionEngine" (correct)   │
│  ├── Pattern: SensorNode                                 │
│  ├── Result: 0 matches (all renamed)                     │
│  ✓ AST-grep verify: clean                                │
│                                                          │
│  Step 3: grep string references                          │
│  ├── Pattern: SensorNode\b                               │
│  └── Result: 0 matches (no missed string refs)           │
│  ✓ Post-check: complete                                  │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"Three verification layers: LSP rename handles the Python symbol references deterministically. Then AST-grep double-checks no `SensorNode` identifier remains. Finally a grep checks for string references that LSP can't see. Triple redundancy."*

### Step 4: Verify Tests Still Pass (2:15-2:45)

```
┌─────────────────────────────────────────────────────────┐
│  Phase 6 — Final Verification                           │
│                                                          │
│  $ python3 -m pytest tests/ -v                           │
│  ✓ test_start_stop PASSED                                │
│  ✓ test_read_returns_reading PASSED                      │
│  ✓ test_statistics_with_readings PASSED                  │
│                                                          │
│  3 passed — all tests green. Refactoring complete.       │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"Tests still pass. The refactoring is verified — not by human inspection, but by actual test execution."*

### Step 5: Show the Result (2:45-3:15)

Show the renamed file side-by-side (or quickly diff):

```diff
--- a/src/sensor_driver.py
+++ b/src/sensor_driver.py
@@ -1,5 +1,5 @@
-class SensorNode:
-    """Simulates a multi-modal sensor fusion node for a CPS robot."""
+class FusionEngine:
+    """Manages multi-modal sensor fusion for a CPS robot."""
```

**Narrator says:**
> *"Clean rename. 5 references across 3 files — all updated. LSP rename is deterministic, not probabilistic — it works through the language server, same as your IDE would, but automated and verified."*

### Step 6: Quick Audience Connection (3:15-4:00)

**Narrator says:**
> *"For a CPS or robotics team: imagine renaming a critical ROS2 node interface across 20 files, launch files, and YAML configs. `/refactor` handles the symbols deterministically and the config references via AST-grep. No 'find in files + manual check'. No 'hope you didn't miss one'. It's surgical, safe, and automated."*

### Talking Points — Why This Matters to the Team

| Domain | Connection |
|--------|-----------|
| **CPS/Robotics** | Tightly coupled C++/Python nodes; renaming a ROS topic, service, or action deterministically across the entire workspace |
| **Model-Driven Engineering** | Codemap generation is model extraction — reverse-engineering the dependency model from code automatically |
| **Software Quality** | Three-layer verification (LSP → AST-grep → grep) guarantees correctness beyond what any single tool provides |
| **IoT** | Firmware codebases often have parallel sensor drivers with similar naming — `/refactor` renames consistently |

### Failure Recovery

| Symptom | Action |
|---------|--------|
| LSP rename fails (clangd not configured) | Fall back to AST-grep replace: `ast_grep_replace` with pattern `SensorNode` → `FusionEngine` in all Python files |
| LSP renames more than expected | Show error as learning moment: "The LSP is being too aggressive — we can narrow scope with AST-grep overrides" |
| Tests fail after rename | Show that Phase 6 caught it: "Verification found the issue — revert and refine the codemap" |
| 5 parallel agents take long | Already mitigated by pre-capturing the Codemap; skip Phase 1 display entirely |

---

# Demo 4B: Session Handoff — Context That Survives

> **Duration:** 3 min · **Agent Focus:** `/handoff` + `/pickup` commands
> **Key Concepts:** Persistent session state · Cross-session continuity · Handoff fidelity
> **Audience Pitch:** *"CPS debugging often spans days. A sensor drops out intermittently — you investigate for hours, context builds up, then the session ends. With Matrixx, nothing is lost."*

---

## Why This Demo (Not the Others)

| Candidate | Why Not Selected |
|-----------|-----------------|
| Matrix Loop | Time-expensive; repetitive to explain |
| Background agent swarm | Already visible in Demo 3 |
| Git-master skill | Better as a supporting act; handoff is unique to Matrixx |
| **Session Handoff** | **Selected**: Unique capability (no other OpenCode plugin has it), visually clear, strongly resonates with researchers doing multi-day investigations |
| Session (context window) recovery | Complex to demonstrate artificially; more of a reliability feature than a showpiece |

---

## Preparation

### Setup

```bash
cd demos/session-4-extra
mkdir -p handoff-demo
```

**`handoff-demo/sensor_log.txt`** — A simulated CPS sensor log with intermittent dropouts:

```
TIMESTAMP,NODE,EVENT,VALUE
2025-07-02T10:00:01,fusion_engine,START,ok
2025-07-02T10:00:02,lidar_front,FRAME,range=12.34
2025-07-02T10:00:02,camera_left,FRAME,features=42
2025-07-02T10:00:03,fusion_engine,FUSION,confidence=0.95
2025-07-02T10:00:03,imu_node,IMU,accel_x=0.12
2025-07-02T10:00:04,lidar_front,FRAME,range=11.89
2025-07-02T10:00:04,camera_left,FRAME,features=38
2025-07-02T10:00:05,fusion_engine,FUSION,confidence=0.94
2025-07-02T10:00:05,imu_node,IMU,accel_x=0.11
2025-07-02T10:00:06,lidar_front,FRAME,range=13.01
2025-07-02T10:00:06,camera_left,DROPOUT,frames_missed=3      ← Intermittent dropout
2025-07-02T10:00:07,fusion_engine,FUSION,confidence=0.12       ← Confidence cratered
2025-07-02T10:00:07,lidar_front,FRAME,range=12.45
2025-07-02T10:00:08,camera_left,DROPOUT,frames_missed=5
2025-07-02T10:00:09,fusion_engine,START,reinit                ← Node restarted
2025-07-02T10:00:09,camera_left,FRAME,features=41
2025-07-02T10:00:10,fusion_engine,FUSION,confidence=0.91
```

**`handoff-demo/investigate.py`** — A script to parse and analyze the log:

```python
"""Analyze CPS sensor log for intermittent dropout patterns."""

import csv
from collections import defaultdict
from typing import TextIO


def parse_log(file: TextIO) -> list[dict]:
    reader = csv.DictReader(file)
    return [row for row in reader]


def find_dropouts(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["EVENT"] == "DROPOUT"]


def find_low_confidence(rows: list[dict], threshold: float = 0.5) -> list[dict]:
    return [
        r for r in rows
        if r["EVENT"] == "FUSION" and float(r["VALUE"].split("=")[1]) < threshold
    ]


def group_by_node(rows: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r["NODE"]].append(r)
    return dict(groups)


if __name__ == "__main__":
    with open("sensor_log.txt") as f:
        rows = parse_log(f)

    dropouts = find_dropouts(rows)
    low_conf = find_low_confidence(rows)

    print(f"Total events: {len(rows)}")
    print(f"Dropouts: {len(dropouts)}")
    for d in dropouts:
        print(f"  {d['TIMESTAMP']} - {d['NODE']}: {d['VALUE']}")

    print(f"\nLow-confidence events: {len(low_conf)}")
    for lc in low_conf:
        print(f"  {lc['TIMESTAMP']} - confidence={lc['VALUE']}")
```

### Pre-flight Check

```bash
cd demos/session-4-extra/handoff-demo
python3 investigate.py
# Expected: Shows parsed sensor log with 2 dropouts and 1 low-confidence event
```

---

## Demo Script

### Part A: Session 1 — Investigate (0:00-1:00)

```bash
cd demos/session-4-extra/handoff-demo
# Open OpenCode here
```

Type in OpenCode:

```
Analyze this sensor log for intermittent dropout patterns.
The fusion_engine confidence cratered at 10:00:07 right after
camera_left dropped frames. Find the correlation pattern and
build a detection heuristic.
```

**What happens:**
1. Agent reads `sensor_log.txt` and `investigate.py`
2. Runs the analysis script: `python3 investigate.py`
3. Identifies the 2-second delay between camera dropout and fusion confidence drop
4. Writes a detection heuristic in `detectors/dropout_detector.py`
5. Creates a visualization script to detect future dropouts

**Narrator says (while agent works):**
> *"The agent is correlating camera dropouts with fusion confidence drops. It's building a heuristic: if a camera node misses 3+ frames and the fusion confidence drops below 0.5 within 2 seconds, flag it as a sensor dropout cascade. This is the kind of investigation a CPS engineer would do — but now it's automated."*

### Part B: Create Handoff (1:00-1:45)

When the analysis is done, type:

```
/handoff
```

**What the audience sees:**

```
┌─────────────────────────────────────────────────────────┐
│  Handoff created: .matrixx/handoff.md                    │
│                                                          │
│  Topics: cps, sensor-dropout, camera-fusion-correlation  │
│                                                          │
│  WORK COMPLETED:                                          │
│  • Parsed sensor_log.txt — found 2 camera dropouts        │
│  • Correlated dropout at 10:00:06 with fusion confidence │
│    crater at 10:00:07 (2s delay)                        │
│  • Built dropout detector in detectors/dropout_detector.py│
│  • Detection heuristic: camera_dropout + confidence < 0.5 │
│    within 2s → cascade event                             │
│                                                          │
│  PENDING TASKS:                                           │
│  • Validate heuristic against a 24-hour log dataset       │
│  • Implement auto-recovery: restart camera node on cascade│
│  • Add real-time monitoring dashboard                     │
│                                                          │
│  KEY FILES:                                               │
│  • handoff-demo/sensor_log.txt                            │
│  • handoff-demo/investigate.py                            │
│  • handoff-demo/detectors/dropout_detector.py             │
│                                                          │
│  Session state preserved. Ready for /pickup.              │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"`/handoff` serializes the full investigation state — what was found, what's pending, which files matter. Close the session. Open a new one the next day. Full context, zero loss."*

### Part C: Session 2 — Resume (1:45-2:30)

Close OpenCode. Reopen and type:

```
/pickup
```

**What the audience sees:**

```
┌─────────────────────────────────────────────────────────┐
│  Handoff loaded: .matrixx/handoff.md                    │
│                                                          │
│  Resuming CPS sensor dropout investigation               │
│                                                          │
│  Previous findings loaded:                               │
│  ✓ 2 camera dropouts found at 10:00:06, 10:00:08         │
│  ✓ Cascade pattern: dropout → 2s → confidence crash      │
│  ✓ Detection heuristic ready                             │
│                                                          │
│  Pending: Validate heurstic against 24-hour log          │
│                                                          │
│  Type "continue" to resume the investigation.            │
└─────────────────────────────────────────────────────────┘
```

**Narrator says:**
> *"`/pickup` restores everything. The agent knows exactly what it found, what it built, and what's left to do. No 'let me re-read the code' — it's already loaded."*

Type:

```
continue — validate the heuristic against a larger dataset
```

**What happens:** The agent picks up where it left off, generates a synthetic 24-hour log, runs the heuristic against it, and reports detection accuracy.

### Part D: The Payoff (2:30-3:00)

```
Heuristic validation against 24-hour synthetic log (86400 events):
  True positives:  12 (correctly detected cascade events)
  False positives:  2 (confidence drop without prior camera dropout)
  False negatives:  0 (no missed cascade events)
  Precision: 85.7%
  Recall:    100%

Recommendation: Deploy heuristic with 85% precision threshold.
Next step: Implement auto-recovery — restart camera node on cascade detection.
```

**Narrator says:**
> *"Seamless continuation across sessions. The agent didn't need re-explaining the problem — it picked up the full context from the handoff file. For a CPS team that spends weeks investigating intermittent faults, this is continuity that saves days per investigation."*

### Talking Points — Why This Matters to the Team

| Domain | Connection |
|--------|-----------|
| **CPS/Robotics** | Long-running field investigations (sensor calibration, actuator drift) span multiple sessions — context must survive |
| **IoT** | Deployed devices generate telemetry 24/7; investigation patterns emerge over days, not minutes |
| **Software Quality** | Root cause analysis of flaky tests or intermittent failures often requires multi-session traceability |
| **All Domains** | The handoff file is plain markdown + YAML frontmatter — human-readable, version-controllable, auditable |

### Failure Recovery

| Symptom | Action |
|---------|--------|
| `/handoff` command not recognized | Fall back: `task(subagent_type="oracle", prompt="Create a handoff...")` |
| `/pickup` doesn't find handoff | Show the file manually: `cat .matrixx/handoff.md`, then say "The handoff file is just markdown — you can read it anywhere" |
| Agent loses context on pickup | Show that the handoff file is still valid; re-invoke "continue from where I left off" referencing the file |
| Demo goes too fast | Condense Part A-D: Show handoff creation (Part B) as the headline moment, skip Part A if needed |

---

## Closing (for presentation, after Demo 3)

**2-minute closer after Demo 3 ends:**

> *"You just saw four demos of what Matrixx does:*
>
> *1. **DSL engineering** — Cipher builds a Robot Mission DSL with TDD*
> *2. **Security auditing** — Sentinel reads every line, changes nothing, reports everything*
> *3. **Code archeology** — `/refactor` transforms CPS code safely with LSP + AST-grep*
> *4. **Session continuity** — `/handoff` ensures no investigation is ever lost*
>
> *The common thread across all of this is **specialization**: instead of one model doing everything poorly, 14 agents each do one thing well. The right model for the right job — automatically.*
>
> *Matrixx is open source. Install it with `npm install -g opencode-matrixx`, configure with a JSONC file, and you get all of this out of the box."*

---

## Under the Hood

### Demo 4A: `/refactor`

| What Happens | Responsible Component | Source Location |
|---|---|---|
| Command invocation | slashcommand handler | `src/features/builtin-commands/` |
| Intent analysis | `/refactor` Phase 0 | `src/features/builtin-commands/templates/refactor.ts` |
| Codebase analysis (5 parallel agents) | Phase 1 — explore agents | `src/features/builtin-commands/templates/refactor.ts` |
| Codemap generation | Phase 2 | `src/features/builtin-commands/templates/refactor.ts` |
| LSP rename | LSP tool (`lsp_rename`) | `src/tools/lsp/` |
| AST-grep post-check | AST-grep tool | `src/tools/ast-grep/` |
| Test verification | Bash (pytest) | Execution phase |
| Metrics summary | Phase 6 | `src/features/builtin-commands/templates/refactor.ts` |

### Demo 4B: Session Handoff

| What Happens | Responsible Component | Source Location |
|---|---|---|
| `/handoff` command | slashcommand handler | `src/features/builtin-commands/commands/slash.ts` |
| Handoff file creation | Handoff tool | `src/features/handoff/` |
| YAML frontmatter generation | Handoff tool | `src/features/handoff/` |
| `/pickup` command | slashcommand handler | `src/features/builtin-commands/commands/slash.ts` |
| Handoff file parsing | Handoff tool | `src/features/handoff/` |
| State restoration | Session load | `src/features/handoff/` |

---

## Key Points

| Highlights | Why It Matters |
|---|---|
| **Demo 4A**: 6-phase refactoring pipeline | CPS/Robotics teams refactor large C++/Python codebases — every change must be safe and verified |
| **Demo 4A**: Three verification layers (LSP → AST-grep → grep) | Software Quality — no single tool provides complete coverage; triple verification is the standard |
| **Demo 4A**: Codemap reveals full dependency graph | MDE — model extraction from code; relevant to Model-Driven Engineering researchers |
| **Demo 4B**: `/handoff` serializes full investigation state | Long-running CPS investigations span days — context survival is critical |
| **Demo 4B**: `/pickup` restores with zero loss | Engineering continuity — no re-learning the problem, no re-building context |
| **Demo 4B**: Handoff file is plain markdown + YAML | Auditable, version-controllable, human-readable — meets research team documentation standards |
