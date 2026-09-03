# Installation

## Prerequisites

| Requirement | Version | Install |
|-------------|---------|---------|
| **Bun** | 1.4.0 | https://bun.sh — `curl -fsSL https://bun.sh/install | bash` |
| **OpenCode** | ≥ 1.0.150 | https://opencode.ai/docs — `curl -fsSL https://opencode.ai/install | bash` |
| **Node.js** | ≥ 18 | https://nodejs.org |
| **Git** | any | — |

Verify before installing Matrixx:

```bash
bun --version        # should be 1.4.0
opencode --version   # should be >= 1.0.150
node --version
git --version
```

> **Note:** `bunx` is part of Bun. If you use `npx` instead, Bun-based features may not work. Install Bun first.

## For Humans

### Option 1: Automatic (via LLM agent — recommended)

Paste this into any LLM agent session (Claude Code, Cursor, etc.):

```
Install and configure matrixx by following the instructions here:
https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/docs/guide/installation.md
```

The agent will walk you through provider selection and authentication.

### Option 2: Manual

Run the interactive installer:

```bash
bunx opencode-matrixx install
```

Follow the prompts to configure Claude, ChatGPT, and Gemini subscriptions.

For non-interactive setup (CI/agents):

```bash
bunx opencode-matrixx install --no-tui --claude=yes --openai=yes --gemini=no --copilot=no
```

Verify:

```bash
bunx opencode-matrixx doctor
# Expected: no "fail" entries. "warn" for missing optional providers is OK.
```

After installation, see the [overview guide](./overview.md).

## For LLM Agents

> **IMPORTANT: Use `curl` to fetch this file, NOT WebFetch.** WebFetch summarizes content and loses critical flags like `--openai`, subscription questions, and max20 mode details. Always use:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/docs/guide/installation.md
> ```

If you're an LLM Agent helping set up matrixx, follow these steps:

### Step 0: Ask user about subscriptions

1. **Claude Pro/Max Subscription?**
   - max20 (20x mode) → `--claude=max20`
   - Pro/Max non-max20 → `--claude=yes`
   - No → `--claude=no` (Morpheus will be degraded — warn user)

2. **OpenAI/ChatGPT Plus?** → `--openai=yes|no`

3. **Gemini integration?** → `--gemini=yes|no`

4. **GitHub Copilot?** → `--copilot=yes|no`

5. **OpenCode Zen (`opencode/` models)?** → `--opencode-zen=yes|no`

6. **Z.ai Coding Plan?** → `--zai-coding-plan=yes|no`

**Provider Priority:** Native (anthropic/, openai/, google/) > GitHub Copilot > OpenCode Zen > Z.ai

### Step 1: Install OpenCode (if not installed)

```bash
if command -v opencode &> /dev/null; then
    echo "OpenCode $(opencode --version) is installed"
else
    echo "OpenCode not installed. See https://opencode.ai/docs"
fi
```

Spawn a subagent to handle installation if missing.

### Step 2: Run the installer

```bash
bunx opencode-matrixx install --no-tui --claude=<yes|no|max20> --gemini=<yes|no> --copilot=<yes|no> [--openai=<yes|no>] [--opencode-zen=<yes|no>] [--zai-coding-plan=<yes|no>]
```

Examples:
- All native: `bunx opencode-matrixx install --no-tui --claude=max20 --openai=yes --gemini=yes --copilot=no`
- Only Claude: `bunx opencode-matrixx install --no-tui --claude=yes --gemini=no --copilot=no`
- Only Copilot: `bunx opencode-matrixx install --no-tui --claude=no --gemini=no --copilot=yes`

The CLI registers the plugin in `~/.config/opencode/opencode.jsonc` as `"opencode-matrixx"` (bare package name, resolved via npm). For local dev checkouts, use `--local` to register a `file://` path.

### Step 3: Verify Setup

```bash
opencode --version  # >= 1.0.150
cat ~/.config/opencode/opencode.jsonc  # should contain "opencode-matrixx" in plugin array
bunx opencode-matrixx doctor            # check for fails
```

`doctor` checks:
- **installation:** OpenCode version + plugin registration
- **configuration:** matrixx.jsonc validity
- **authentication:** reads `~/.local/share/opencode/auth.json` (from `opencode auth login`) + env vars; `warn` if some providers missing, `fail` only if none configured
- **dependencies:** Bun, Node, Git, Python3
- **tools:** ast-grep, Gitleaks, PyMuPDF, Playwright (optional)

Use `bunx opencode-matrixx doctor --json` for machine-readable output or `--category authentication` to check one category.

### Step 4: Configure Authentication

Run interactive login for each provider the user has:

#### Anthropic (Claude)

```bash
opencode auth login
# Select Anthropic → Claude Pro/Max → OAuth in browser
```

#### Google Gemini (Antigravity OAuth)

Add the antigravity plugin:

```json
{ "plugin": ["opencode-matrixx", "opencode-antigravity-auth@latest"] }
```

Read [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) for full model config, then:

```bash
opencode auth login
# Select Google → OAuth with Google (Antigravity)
```

#### GitHub Copilot

```bash
opencode auth login
# Select GitHub → OAuth
```

#### OpenCode Zen / Z.ai

Authenticated via `opencode auth login` provider selection as well.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `could not determine executable to run for package opencode-matrixx` | Stale Bun cache or old package (pre-2.6.0) | `bun pm cache rm && bunx opencode-matrixx@latest --help`; ensure you're on ≥ 2.6.0 |
| `opencode-matrixx doctor` says `No API providers configured` after `opencode auth login` | Doctor checked wrong file (fixed in 2.6.0) | Update: `bunx opencode-matrixx@latest doctor`; verify auth storage: `cat ~/.local/share/opencode/auth.json` or `opencode auth list` |
| Plugin not loading in OpenCode | Plugin entry is `file://` pointing to deleted temp dir | Re-run `bunx opencode-matrixx install` (without `--local`); check `cat ~/.config/opencode/opencode.jsonc` contains `"opencode-matrixx"` |
| `opencode.json` vs `opencode.jsonc` | OpenCode supports both; doctor checks both + `.jsonc` comments | Ensure your config is valid JSONC: `cat ~/.config/opencode/opencode.jsonc` |
| `bunx` not found | Bun not installed or not in PATH | `curl -fsSL https://bun.sh/install | bash` then reopen shell |
| `npx opencode-matrixx` fails | `npx` uses Node, but CLI needs Bun (`#!/usr/bin/env bun`) | Use `bunx opencode-matrixx` instead |

If `doctor` still fails after these steps, run with verbose JSON and share output:

```bash
bunx opencode-matrixx doctor --json
opencode auth list
cat ~/.config/opencode/opencode.jsonc
cat ~/.local/share/opencode/auth.json | head -20
```

