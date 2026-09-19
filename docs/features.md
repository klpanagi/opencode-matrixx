# Matrixx Features

> Version 2.6.10. This page is an index-hub: what Matrixx is, what is unique to this page, and where each subsystem is documented canonically. Roster tables live in the canonical docs — they are linked, not duplicated, here.

Matrixx is a multi-agent orchestration plugin for OpenCode: specialized agents, category-routed delegation, lazily-loaded skills, slash-command workflows, lifecycle hooks, file-backed tasks, and a BDD pipeline — all configured through `matrixx.json`/`matrixx.jsonc`.

## Canonical Docs

| Subsystem | Canonical doc |
|-----------|---------------|
| Agents (14-agent roster, models, fallbacks, permissions, background/tmux) | [Agents](agents.md) |
| Categories, skills, combos, task-prompt guide | [Category & Skill System Guide](category-skill-guide.md) |
| Commands (full argument reference) | [Command Reference](command-reference.md) |
| Tasks, mission state, continuation, `/task-list`, `/cleanup-tasks` | [Task System](task-system.md) |
| BDD pipeline (`/bdd-contract`, `/bdd-tests`, `/bdd-frontend`, `/bdd-backend`, `/bdd-pipeline`) | [BDD](bdd.md) |
| Self-evolution proposals (`/evolution`) | [Evolution](evolution.md) |
| TDD enforcement | [TDD](tdd.md) |
| Hooks (lifecycle automation, DCP, truncation, recovery) | [Hooks](hooks.md) |
| Context management (DCP tiers, `/dcp-profile`, Headroom, `ctx_*` sandbox) | [Context Management](context-management.md) |
| Planning/execution model, delegation flows | [Orchestration](orchestration.md) |
| Configuration (`matrixx.json`, presets, `browser_automation_engine`) | [Configuration](configurations.md) |

## Agents (summary)

Matrixx provides 14 specialized agents (`BuiltinAgentNameSchema` in `src/config/schema/agent-names.ts`; factories in `src/agents/`): Morpheus (default orchestrator), Keymaker, Merovingian, Operator, Trinity, Construct, Sati (frontend), Architect, Cipher (DSL), Sentinel (security, read-only), Oracle, Seraph, Smith, plus `bdd-contract`. Full roster with models, fallbacks, tool restrictions, and background/tmux usage: [Agents](agents.md). Planning/execution model: [Orchestration](orchestration.md).

### Background Agents (summary)

Run agents in the background and continue working; with `tmux.enabled`, background agents spawn in visible panes. Details: [Agents](agents.md); config: [Configuration](configurations.md#agents).

## Skills (summary)

Skills inject specialized knowledge and MCP tools into agents. Full catalog: [Category & Skill System Guide](category-skill-guide.md).

## Skills Unique to This Page

Skill counts, honest version (verified against `src/config/schema/agent-names.ts`, `src/features/builtin-skills/skills.ts`, and `src/features/builtin-skills/skills/` on disk): **37** names in `BuiltinSkillNameSchema`; **46** loader keys in `skillLoaders`; **45** skill modules on disk (`agent-browser` is provider-resolved and ships no module file). Full catalog: [Category & Skill System Guide](category-skill-guide.md).

All built-in skills follow **SDO (Skill Discovery Optimization)** — descriptions use trigger-first patterns with cross-references for high-precision agent delegation.

### Lazy Skill Loading (Built-in Skills)

All non-browser built-in skills use **lazy template resolution**. Skill factories (and their large markdown template bodies) are NOT evaluated at plugin init — they hydrate on first reference via a self-destructing getter pattern.

**How it works:**

- `createBuiltinSkills()` returns BuiltinSkill objects whose `.template` is an `Object.defineProperty` getter.
- On first `.template` access, the factory is invoked once; the result is cached on the skill object (replaces getter with a data property).
- Browser skills (playwright / agent-browser / playwright-cli) are loaded eagerly because the active provider is decided at init; all other skills are lazy.
- `description` is populated only on first access as well (cannot call factory eagerly without defeating laziness).

**Why it matters:**

- **Faster plugin init** — module parse time for skill files is deferred.
- **Lower memory pressure at startup** — template bodies (often 5–20KB of markdown each) stay un-evaluated.
- **Zero behavioral change** — the API (`BuiltinSkill.template: string`) is unchanged. Consumers see no difference.
- **Transparent** — no config flag, no opt-in.

**Files:**

- `src/features/builtin-skills/lazy-skill-helper.ts` — `createLazyTemplateSkill()` factory + cache.
- `src/features/builtin-skills/skills.ts` — wraps all non-browser skill loaders via the helper (`BROWSER_SKILL_NAMES`, eager `browserSkillName` resolution, `lazySkillNames` filter).

**Note:** Custom (project / user) skills loaded via the opencode-skill-loader are NOT affected — they already use the async `LazyContentLoader` pattern for their markdown bodies.

### Per-Task Complexity Routing (delegate_task)

The `delegate_task` tool accepts an optional `complexity` field (1-5 or `"auto"`) that allows the resolver to downgrade the model to a cheaper model when the task is judged simple. This is an **orthogonal, opt-in** dimension layered on top of the existing 8-category routing.

**Levels:**

| Level | Heuristic | Typical use |
|-------|-----------|-------------|
| 1 | Trivial — typo fix, single-line change, no dependencies | "Rename variable X to Y" |
| 2 | Small — few files, low coupling, well-scoped | "Add a log line to this hook" |
| 3 | Moderate (default) — typical delegate_task work | "Refactor this component" |
| 4 | Complex — multi-file, design decisions | "Add a new MCP server" |
| 5 | Architecturally significant | "Design the auth flow" |

**How it works:**

- **No complexity param (default `"auto"`):** `autoScoreComplexity()` inspects the task's `description`, `prompt`, `load_skills`, and `category` to assign a conservative level. The default is 3 (no downgrade).
- **Explicit number:** Caller overrides the auto-score (e.g., `complexity: 1` for a known-trivial task).
- **Downgrade only:** P3 NEVER upgrades a task to a more expensive model. If the resolved model is already the cheapest available for the category, nothing happens.
- **Per-category downgrade map:** Built-in `BUILTIN_COMPLEXITY_DOWNGRADES` maps each category to a cheaper model for levels 1-2. Users can override per category via `complexity_downgrades` in their `matrixx.jsonc`.
- **Logged:** Every downgrade decision is logged with `from`/`to`/`complexity` for transparency. The tool result includes `complexityApplied` and `complexityDowngraded` flags.

**Cost impact:**

- **Honest estimate: 15-25% cost reduction** on routable tasks for sessions with model headroom.
- **0% savings when categories already pin the cheapest model** — there is nowhere to downgrade from.
- Quality impact: conservative default + explicit override + per-task logging means the pilotfish-validated 96% quality at 46% cost (Anthropic BrowseComp) is achievable in principle, but real-world Matrixx savings are lower because typical sessions have fewer routable tasks than the pilotfish benchmark.

**100% backwards compatible:** omitting `complexity` from a `delegate_task` call leaves behavior identical to before. The tool schema adds the field as optional with default `"auto"`.

**Files:**

- `src/tools/delegate-task/complexity-types.ts` — `ComplexityLevel` type + `Complexity` union (1-5 | "auto")
- `src/tools/delegate-task/complexity-constants.ts` — `BUILTIN_COMPLEXITY_DOWNGRADES` + `resolveComplexityModel()`
- `src/tools/delegate-task/complexity-scorer.ts` — `autoScoreComplexity()` heuristic (file/line counts, keywords, category modifier)
- `src/tools/delegate-task/category-resolver.ts` — full integration: auto-score → resolve → log → re-parse model
- `src/config/schema/categories.ts` — `complexity_downgrades` per-category override field
- `assets/matrixx.schema.json` — regenerated

### Skill: Browser Automation (playwright / agent-browser)

**Trigger**: Any browser-related request

Matrixx provides browser automation providers, configurable via `browser_automation_engine.provider` (eagerly resolved at init — see `browserSkillName` in `src/features/builtin-skills/skills.ts`):

#### Option 1: Playwright MCP (Default)

The default provider uses Playwright MCP server:

```yaml
mcp:
  playwright:
    command: npx
    args: ["@playwright/mcp@latest"]
```

**Usage**:
```
/playwright Navigate to example.com and take a screenshot
```

#### Option 2: Agent Browser CLI (Vercel)

Alternative provider using [Vercel's agent-browser CLI](https://github.com/vercel-labs/agent-browser):

```json
{
  "browser_automation_engine": {
    "provider": "agent-browser"
  }
}
```

**Requires installation**:
```bash
bun add -g agent-browser
```

**Usage**:
```
Use agent-browser to navigate to example.com and extract the main heading
```

#### Capabilities (All Providers)

- Navigate and interact with web pages
- Take screenshots and PDFs
- Fill forms and click elements
- Wait for network requests
- Scrape content

## Commands (summary)

Slash-triggered workflows. Counts, honest version: **19** names in `BuiltinCommandNameSchema` (`src/config/schema/commands.ts`); **24** entries in `BUILTIN_COMMAND_DEFINITIONS` (`src/features/builtin-commands/commands.ts` — adds `pickup`, `remove-deadcode`, `evolution`, `cleanup-tasks`, `task-list` beyond the schema); **22** template files in `src/features/builtin-commands/templates/`. Full argument reference: [Command Reference](command-reference.md). Custom commands load from `.opencode/command/*.md` (project) and `~/.config/opencode/command/*.md` (user).

Single-skill deep dives (`frontend-ui-ux`, `git-master`, `ulw-research`, `remove-ai-slops`) live in [Category & Skill System Guide](category-skill-guide.md). Runtime toggles (`/ultrawork`, `/assembly`, `/end-ultrawork`, `/preset`, `/dcp-profile`, `/stop-continuation`, `/remove-deadcode`, `/task-list`, `/cleanup-tasks`, `/evolution`, `/handoff`, `/pickup`, `/research`, loops, BDD commands) are documented canonically in [Command Reference](command-reference.md) and [Task System](task-system.md).

## Hooks, Tools, MCPs, Context (summaries)

- **Hooks** (lifecycle automation, quality gates, recovery, task enforcers): [Hooks](hooks.md).
- **Tools** (LSP, AST-grep, delegation, task tools, assembly, session, handoff): the task tools are canonically documented in [Task System](task-system.md); delegation categories in [Category & Skill System Guide](category-skill-guide.md).
- **MCPs** (`websearch`, `context7`, `github_search`, `document_reader`; skill-embedded MCPs): [Configuration](configurations.md).
- **Context injection** (AGENTS.md, conditional rules) and DCP tiers: [Context Management](context-management.md).
- **Handoff** (`/handoff` → `/pickup`, `.matrixx/handoff.md`): [Command Reference](command-reference.md) and [Task System](task-system.md).
- **BDD pipeline** (`/bdd-contract`, `/bdd-tests`, `/bdd-frontend`, `/bdd-backend`, `/bdd-pipeline`): [BDD](bdd.md).
- **TDD enforcement**: [TDD](tdd.md). **Self-evolution** (`/evolution`): [Evolution](evolution.md).
- Custom skills load from `.opencode/skills/*/SKILL.md` (project) and `~/.config/opencode/skills/*/SKILL.md` (user); disable built-ins via `disabled_skills` in config.

## Removed: Claude Code Compatibility

The legacy Claude Code compatibility layer (`.claude/commands/`, `.claude/skills/`, `.claude/agents/`, `.claude/.mcp.json` loaders, `~/.claude/todos/` storage, and the `claude_code` config toggles) no longer exists in-tree: there are zero `.claude/` path references and zero `claude_code` config keys anywhere under `src/`. If you see older docs or configs mentioning them, drop those entries.

Custom commands and skills now load from OpenCode paths only:

- Commands: `.opencode/command/*.md` (project), `~/.config/opencode/command/*.md` (user)
- Skills: `.opencode/skills/*/SKILL.md` (project), `~/.config/opencode/skills/*/SKILL.md` (user)
