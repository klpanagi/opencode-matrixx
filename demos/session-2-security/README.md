# Demo 2: Security Audit

> **Duration:** ~8-10 min · **Agent Focus:** Sentinel · **Hook Focus:** Secret Leak Guard + Env File Write Guard
> **Key Concepts:** Read-only auditing · CWE classification · Preventive hooks · Separation of duties

---

## The Pitch

*"Watch how Sentinel — a read-only security auditor — scans a vulnerable Flask app, produces a professional report with CWE IDs and severities, and how preventive hooks stop security issues from ever reaching production."*

---

## Preparation

The vulnerable app is already in `vuln-app/`. No setup needed — start OpenCode there.

```bash
cd demos/session-2-security/vuln-app
# Start OpenCode here.
```

### The Vulnerable App (for reference)

```python
# app.py
from flask import Flask, request
import sqlite3

app = Flask(__name__)
API_KEY = "sk-live-a1b2c3d4e5f6g7h8i9j0"

@app.route("/login")
def login():
    username = request.args.get("username")
    password = request.args.get("password")
    conn = sqlite3.connect("users.db")
    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    cursor = conn.execute(query)
    user = cursor.fetchone()
    if user:
        return {"status": "ok", "token": "hardcoded-jwt-token"}
    return {"status": "denied"}, 401
```

**.env file:**
```
DB_PASSWORD=SuperSecret123!
```

---

## Script

### Step 1: Request Security Audit (0:00-1:00)

Open OpenCode in `vuln-app/` and type:

```
Please audit this Flask app for security vulnerabilities.
I want a full report with CWE IDs, severity, and remediation.
```

### Step 2: Sentinel Invoked (1:00-4:00)

> **Behind the scenes:**
> 1. Morpheus detects security domain → dispatches **Sentinel** (read-only agent)
> 2. Sentinel loads 9 security skills automatically
> 3. Scans all files — reports findings, **NEVER modifies code**

**Audience sees: Sentinel's report:**

```
┌─────────────────────────────────────────────────────────┐
│  SENTINEL SECURITY AUDIT REPORT                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔴 CRITICAL — Hardcoded API Key                        │
│     File: app.py:3                                      │
│     CWE: CWE-798 (Hardcoded Credentials)                │
│     Remediation: Use environment variable               │
│                                                         │
│  🔴 CRITICAL — SQL Injection                            │
│     File: app.py:11                                     │
│     CWE: CWE-89 (SQL Injection)                         │
│     Remediation: Use parameterized queries               │
│                                                         │
│  🟠 HIGH — Hardcoded JWT Secret                          │
│     File: app.py:15                                     │
│     CWE: CWE-321 (Hardcoded Cryptographic Key)          │
│                                                         │
│  🟡 MEDIUM — Missing Security Headers                    │
│     File: app.py                                        │
│     CWE: CWE-693 (Protection Mechanism Failure)         │
│                                                         │
│  🟡 MEDIUM — Exposed .env File                           │
│     File: .env                                          │
│     CWE: CWE-200 (Information Exposure)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**🎙️ HINT:** *"Sentinel is read-only. It never touches code — it only reports. Each finding has a CWE ID, exact file location, and actionable remediation. It loaded 9 security skills automatically."*

### Step 3: Show Preventive Hooks (4:00-6:00)

Now show that Matrixx PREVENTS these issues from reaching production.

**Secret Leak Guard** — intercepts git commit/push (runs gitleaks):
```
$ git add app.py && git commit -m "add api key"
🔒 SECRET LEAK DETECTED — git operation blocked.
Found 2 potential secret(s):
  - High: API Key in app.py:3
  - Medium: JWT Token in app.py:15
Remove the secrets before committing.
```

**Env File Write Guard** — blocks writes to sensitive files:
```
🔒 SENSITIVE FILE GUARD — write blocked.
File ".env" matches a sensitive file pattern.
Writing secrets directly to files is forbidden.
Use environment variables instead.
```

**🎙️ HINT:** *"These aren't optional — they're hooks that run on every tool execution. Secret Leak Guard runs gitleaks on every git commit. Env File Write Guard blocks any agent from writing to .env, .pem, .key files. Both enabled by default."*

### Step 4: Fix Based on Sentinel Report (6:00-8:00)

```
Based on Sentinel's report, please fix all CRITICAL and HIGH findings.
```

> **Behind the scenes:** Morpheus reads the Sentinel report and dispatches fixes:
> - Replaces hardcoded API key with `os.environ.get("API_KEY")`
> - Replaces f-string SQL with parameterized queries
> - Removes hardcoded JWT, generates secure tokens
> - Adds security headers
> - Cleans up .env

```
Based on Sentinel's report, please fix all CRITICAL and HIGH findings.
```

**🎙️ HINT:** *"Sentinel reports — Morpheus fixes. The separation of concerns means the auditor is never tempted to hide its findings. The security assessment is independent from the remediation."*

---

## The Guard Chain Architecture

From `src/plugin/tool-execute-before.ts` — 3-wave execution when ANY tool runs:

| Wave | Type | Behavior | Affects |
|------|------|----------|---------|
| 1 | READ-ONLY | Tracks writes for post-lint, injects context | Non-blocking |
| 2 | **BLOCKING** | Secret scan, env guard, file overwrite guard | **Kills operation** |
| 3 | MUTATORS | Env injection, read warnings, architect reminders | Wraps prompt |

**Key insight:** Wave 2 runs in parallel — **first rejection wins**. The fastest guard to find a problem kills the operation.

---

## Key Points

| Highlights | Why It Matters |
|---|---|
| Sentinel is read-only — auditor never modifies code | Separation of duties — critical for security auditing |
| CWE IDs & severity classification | Academic/industry standard compliance |
| Secret Leak Guard + Env File Write Guard | Preventive security, not just detective |
| Guard chain is 3-wave with first-rejection-wins | Performance + safety designed in |
| 9 composable security skills | Relevant to Cybersecurity research |
