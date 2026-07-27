# FEATURES KNOWLEDGE BASE

## OVERVIEW

15 feature modules extending plugin capabilities: agent orchestration, skill management, MCP infrastructure, task storage, handoff, and tmux integration.

## STRUCTURE
```
features/
├── background-agent/           # Task lifecycle, concurrency (29 files, ~5000 LOC)
│   ├── manager.ts              # Main task orchestration (1646 lines)
│   └── concurrency.ts          # Parallel execution limits per provider/model
├── tmux-subagent/              # Tmux integration (25 files, ~3000 LOC)
│   └── manager.ts              # Pane management, grid planning (350 lines)
├── builtin-skills/             # Built-in skills (8 files, ~1700 LOC)
│   └── skills/                 # dev-browser, frontend-ui-ux, git-master (1111), matrixx-self-config, playwright
├── builtin-commands/           # 6 command templates (11 files, 1511 LOC)
│   └── templates/              # refactor, matrix-loop, init-deep, handoff, start-work, stop-continuation
├── task-storage/               # Task schema + storage (7 files, 1165 LOC)
├── context-injector/           # AGENTS.md, README.md, rules injection (6 files, 809 LOC)
├── handoff/                    # Multi-action handoff: create, read, list, archive
├── session-state/              # Subagent session state tracking (3 files)
├── hook-message-injector/      # System message injection (4 files)
├── task-toast-manager/         # Task progress notifications (4 files)
├── mission-state/              # Persistent state for multi-step ops (9 files)
└── tool-metadata-store/        # Tool execution metadata caching (3 files)```

## KEY PATTERNS

**Background Agent Lifecycle:**
Task creation → Queue → Concurrency check → Execute → Monitor/Poll → Notification → Cleanup
**Skill Management:** All skills are loaded from `src/features/builtin-skills/` via `createBuiltinSkills()`. No external skill directory loading. Skills are configured via `disabled_skills` in `matrixx.jsonc`.

**SKILL.md Format:**
```yaml
---
name: my-skill
description: "..."
model: "claude-opus-4-6"    # optional
agent: "morpheus"           # optional
mcp:                        # optional embedded MCPs
  server-name:
    type: http
    url: https://...
---
# Skill instruction content
```

## HOW TO ADD

1. Create directory under `src/features/`
2. Add `index.ts`, `types.ts`, `constants.ts` as needed
3. Export from `index.ts` following barrel pattern
4. Register in main plugin if plugin-level feature

## CHILD DOCUMENTATION

- See `task-storage/AGENTS.md` for task schema and storage details
