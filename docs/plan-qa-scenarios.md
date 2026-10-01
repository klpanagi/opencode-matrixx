# Plan QA Scenarios — Agent-Executed Verification Guide

> Externalized from the Oracle plan skeleton to keep generated plans lean.
> The skeleton references this file instead of embedding it.

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

> Whether TDD is enabled or not, EVERY task MUST include Agent-Executed QA Scenarios.
> - **With TDD**: QA scenarios complement unit tests at integration/E2E level
> - **Without TDD**: QA scenarios are the PRIMARY verification method
>
> These describe how the executing agent DIRECTLY verifies the deliverable
> by running it — opening browsers, executing commands, sending API requests.
> The agent performs what a human tester would do, but automated via tools.

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Frontend/UI** | Playwright (playwright skill) | Navigate, interact, assert DOM, screenshot |
| **TUI/CLI** | interactive_bash (tmux) | Run command, send keystrokes, validate output |
| **API/Backend** | Bash (curl/httpie) | Send requests, parse responses, assert fields |
| **Library/Module** | Bash (bun/node REPL) | Import, call functions, compare output |
| **Config/Infra** | Bash (shell commands) | Apply config, run state checks, validate |

**Each Scenario MUST Follow This Format:**

```
Scenario: [Descriptive name — what user action/flow is being verified]
  Tool: [Playwright / interactive_bash / Bash]
  Preconditions: [What must be true before this scenario runs]
  Steps:
    1. [Exact action with specific selector/command/endpoint]
    2. [Next action with expected intermediate state]
    3. [Assertion with exact expected value]
  Expected Result: [Concrete, observable outcome]
  Failure Indicators: [What would indicate failure]
  Evidence: [Screenshot path / output capture / response body path]
```

**Scenario Detail Requirements:**
- **Selectors**: Specific CSS selectors (`.login-button`, not "the login button")
- **Data**: Concrete test data (`"test@example.com"`, not `"[email]"`)
- **Assertions**: Exact values (`text contains "Welcome back"`, not "verify it works")
- **Timing**: Include wait conditions where relevant (`Wait for .dashboard (timeout: 10s)`)
- **Negative Scenarios**: At least ONE failure/error scenario per feature
- **Evidence Paths**: Specific file paths (`.matrixx/evidence/task-N-scenario-name.png`)

**Anti-patterns (NEVER write scenarios like this):**
- ❌ "Verify the login page works correctly"
- ❌ "Check that the API returns the right data"
- ❌ "Test the form validation"
- ❌ "User opens browser and confirms..."

**Write scenarios like this instead:**
- ✅ `Navigate to /login → Fill input[name="email"] with "test@example.com" → Fill input[name="password"] with "Pass123!" → Click button[type="submit"] → Wait for /dashboard → Assert h1 contains "Welcome"`
- ✅ `POST /api/users {"name":"Test","email":"new@test.com"} → Assert status 201 → Assert response.id is UUID → GET /api/users/{id} → Assert name equals "Test"`
- ✅ `Run ./cli --config test.yaml → Wait for "Loaded" in stdout → Send "q" → Assert exit code 0 → Assert stdout contains "Goodbye"`

**Evidence Requirements:**
- Screenshots: `.matrixx/evidence/` for all UI verifications
- Terminal output: Captured for CLI/TUI verifications
- Response bodies: Saved for API verifications
- All evidence referenced by specific file path in acceptance criteria
