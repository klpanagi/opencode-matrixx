# Matrixx CLI Guide

> Version 2.6.10. The CLI entry is `src/cli/index.ts`. Real commands: `doctor`, `install`, `setup`, `version`, `help`.

This document provides a comprehensive guide to using the Matrixx CLI tools.

## 1. Overview

Matrixx provides CLI tools accessible via the `bunx opencode-matrixx` command (or `bunx matrixx` once installed locally — the binary is named `matrixx`, but the npm package is `opencode-matrixx`). The CLI supports various features including plugin installation, environment diagnostics, and session execution.

```bash
# Basic execution (displays help)
bunx opencode-matrixx

# Or run with npx
npx opencode-matrixx
```

---

## 2. Available Commands

| Command | Description |
|---------|-------------|
| `install` | Interactive Setup Wizard |
| `setup` | Standalone setup wizard for deps + matrixx.jsonc generation |
| `doctor` | Environment diagnostics and health checks |
| `version` | Display version information |
| `help` | Display help information |

---

## 3. `install` - Interactive Setup Wizard

An interactive installation tool for initial Matrixx setup. Provides a beautiful TUI (Text User Interface) based on `@clack/prompts`.

### Usage

```bash
bunx opencode-matrixx install
```

### Installation Process

1. **Provider Selection**: Choose your AI provider from Claude, ChatGPT, or Gemini.
2. **API Key Input**: Enter the API key for your selected provider.
3. **Configuration File Creation**: Generates `opencode.json` or `matrixx.json` files.
4. **Plugin Registration**: Automatically registers the matrixx plugin in OpenCode settings.

### Options

| Option | Description |
|--------|-------------|
| `--no-tui` | Run in non-interactive mode without TUI (for CI/CD environments) |
| `--local` | Use local repo file:// path (dev only) |
| `--verbose` | Display detailed logs |

### Subscription flags (`install --no-tui`)

Preseed provider subscriptions without prompts:

| Flag | Values |
|------|--------|
| `--claude=<yes\|no\|max20>` | Claude subscription |
| `--openai=<yes\|no>` | OpenAI subscription |
| `--gemini=<yes\|no>` | Gemini subscription |
| `--copilot=<yes\|no>` | Muse subscription |
| `--opencode-zen=<yes\|no>` | OpenCode Zen subscription |
| `--zai-coding-plan=<yes\|no>` | ZAI coding plan subscription |

---

## 4. `doctor` - Environment Diagnostics

Diagnoses your environment to ensure Matrixx is functioning correctly. Runs 12 checks (`ALL_CHECKS` in `src/cli/doctor/checks/index.ts`).

### Usage

```bash
bunx opencode-matrixx doctor
```

### Diagnostic Categories

| Category | Check Items |
|----------|-------------|
| **installation** | OpenCode version (>= 1.0.150), plugin registration status |
| **configuration** | Configuration file validity, JSONC parsing |
| **authentication** | Anthropic, OpenAI, Google API key validity |
| **dependencies** | Bun, Node.js, Git, Python installation status |
| **tools** | Optional tools (ast-grep, Gitleaks, PyMuPDF, Playwright) |
| **integrations** | Headroom, RTK, DCP, context-mode, tmux, Docker, MCP prerequisites |

### Options

| Option | Description |
|--------|-------------|
| `--category <name>` | Check specific category only (e.g., `--category authentication`) |
| `--json` | Output results in JSON format |
| `--verbose` | Include detailed information |

### Example Output

```
matrixx doctor

┌──────────────────────────────────────────────────┐
│  Matrixx Doctor                           │
└──────────────────────────────────────────────────┘

Installation
  ✓ OpenCode version: 1.0.155 (>= 1.0.150)
  ✓ Plugin registered in opencode.json

Configuration
  ✓ matrixx.json is valid

Authentication
  ✓ Anthropic API key configured
  ✓ OpenAI API key configured
  ✗ Google API key not found

Dependencies
  ✓ Bun 1.4.0 installed
  ✓ Node.js 22.0.0 installed
  ✓ Git 2.45.0 installed

Summary: 10 passed, 1 warning, 1 failed
```

---

## 5. `setup` - Standalone Setup Wizard

Generates deps + `matrixx.jsonc` without the full install flow. Entry: `src/cli/setup/index.ts`.

### Usage

```bash
bunx opencode-matrixx setup
bunx opencode-matrixx setup --yes --dry-run
```

### Options

| Option | Description |
|--------|-------------|
| `--yes, -y` | Non-interactive defaults (no prompts, overwrite without asking) |
| `--dry-run` | Preview changes without writing |
| `--skip-presets` | Skip model preset generation (headless/CI) |

When no `model_presets` exist in the target config, setup generates a `default` preset from your connected providers. If no providers are connected, setup aborts with an error telling you to configure a provider first.

---


## 6. Authentication

There is no `auth` subcommand. Authentication is handled in two places:

1. **Install wizard** (`bunx opencode-matrixx install`) — captures provider API keys during setup.
2. **Doctor** (`bunx opencode-matrixx doctor --category authentication`) — reports provider API key status.

For Google Gemini, Matrixx recommends the external [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth) plugin. See [Configuration > Google Auth](configurations.md#google-auth).

---

## 7. In-Session Slash Commands

These are slash commands used within OpenCode sessions during active conversations. They are **not** CLI subcommands — see [Command Reference](command-reference.md) for the full documentation:

- [`/end-ultrawork`](command-reference.md) — deactivate ultrawork mode for the current session.
- [`/handoff`](command-reference.md) — create `.matrixx/handoff.md` for continuation in a new session.
- [`/pickup`](command-reference.md) — load handoff context from a previous session.

---

## 8. Configuration Files

The CLI searches for configuration files in the following locations (in priority order):

1. **Project Level**: `.opencode/matrixx.jsonc` (preferred) or `.opencode/matrixx.json`
2. **User Level**: `~/.config/opencode/matrixx.jsonc` (preferred) or `~/.config/opencode/matrixx.json`

### JSONC Support

Configuration files support **JSONC (JSON with Comments)** format. You can use comments and trailing commas.

```jsonc
{
  // Agent configuration
  "morpheus_agent": {
    "disabled": false,
    "planner_enabled": true,
  },
  
  /* Category customization */
  "categories": {
    "construct": {
      "model": "anthropic/claude-sonnet-4-6",
    },
  },
}
```

---

## 9. Troubleshooting

### "OpenCode version too old" Error

```bash
# Update OpenCode
bun add -g opencode@latest
```

### "Plugin not registered" Error

```bash
# Reinstall plugin
bunx opencode-matrixx install
```

### Doctor Check Failures

```bash
# Diagnose with detailed information
bunx opencode-matrixx doctor --verbose

# Check specific category only
bunx opencode-matrixx doctor --category authentication
```

---

## 10. Non-Interactive Mode

Use the `--no-tui` option for CI/CD environments.

```bash
# Run doctor in CI environment
bunx opencode-matrixx doctor --no-tui --json

# Save results to file
bunx opencode-matrixx doctor --json > doctor-report.json
```

---

## 11. Developer Information

### CLI Structure

```
src/cli/
├── index.ts              # Main entry (doctor | install | setup | version | help)
├── install/
│   └── index.ts          # @clack/prompts-based TUI installer
├── setup/                # Standalone setup wizard (deps + matrixx.jsonc)
│   ├── index.ts          # executeSetup({ dryRun, yes, skipPresets })
│   ├── prompts.ts        # Interactive prompts
│   ├── preset-wizard.ts  # Model preset generation
│   ├── config-writer.ts  # matrixx.jsonc writer
│   ├── opencode-sync.ts  # opencode.json sync
│   ├── deps.ts           # Dependency checks
│   └── constants.ts      # Setup constants
├── doctor/               # Health check system (12 checks)
│   ├── index.ts          # Doctor command entry
│   ├── types.ts          # DoctorCheck types
│   ├── format.ts         # Output formatting
│   └── checks/           # auth, config, context-mode, dcp, docker,
│                         # headroom, mcp, optional, plugin, rtk,
│                         # runtime, tmux (+ helpers, index)
```

Config loading lives outside the CLI: Zod schemas in `src/config/schema/`, JSONC parsing in `src/shared/jsonc-parser.ts`.

### Adding New Doctor Checks

1. Create `src/cli/doctor/checks/my-check.ts`:

```typescript
import type { DoctorCheck } from "../types"

export const myCheck: DoctorCheck = {
  name: "my-check",
  category: "environment",
  check: async () => {
    // Check logic
    const isOk = await someValidation()
    
    return {
      status: isOk ? "pass" : "fail",
      message: isOk ? "Everything looks good" : "Something is wrong",
    }
  },
}
```

2. Register in `src/cli/doctor/checks/index.ts` (import, add to `ALL_CHECKS`, re-export):

```typescript
import { myCheck } from "./my-check"

export const ALL_CHECKS: DoctorCheck[] = [
  // ...existing checks
  myCheck,
]

export { myCheck } from "./my-check"
```
