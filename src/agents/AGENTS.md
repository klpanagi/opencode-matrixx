# AGENTS KNOWLEDGE BASE

## OVERVIEW

15 AI agents with factory functions, fallback chains, and model-specific prompt variants. Each agent has metadata (category, cost, triggers) and configurable tool restrictions.

`Smith` is the **pre-execution** reviewer (binary `[OKAY]`/`[REJECT]`, max 3 blockers). `Auditor` is the **post-execution** reviewer (Summary / Score / Complexity / Required Effort), invoked **only** by the explicit `/plan-review` command — never automatically, and never on a hook, idle, or completion trigger.

## STRUCTURE
```
agents/
├── morpheus.ts                 # Main orchestrator (530 lines)
├── keymaker.ts               # Autonomous deep worker (624 lines)
├── seraph.ts                    # Pre-planning analysis (347 lines)
├── oracle/                     # Plan Builder / Planner
│   ├── index.ts
│   ├── system-prompt.ts        # 6-section prompt assembly
│   ├── plan-template.ts        # Work plan structure (423 lines)
│   ├── interview-mode.ts       # Interview flow (335 lines)
│   ├── plan-generation.ts
│   ├── high-accuracy-mode.ts
│   ├── identity-constraints.ts # Identity rules (301 lines)
│   └── behavioral-summary.ts
├── architect/                      # Master orchestrator
│   ├── agent.ts                # Architect factory
│   ├── default.ts              # Claude-optimized prompt
│   ├── gpt.ts                  # GPT-optimized prompt
│   └── index.ts
├── cipher.ts                    # DSL engineering specialist
├── sentinel.ts                 # Security auditor (220 lines)
├── merovingian.ts              # High-IQ consultation
├── smith.ts                    # Plan validator (244 lines) — pre-execution reviewer
├── auditor.ts                  # Post-execution plan auditor (147 lines) — /plan-review only
├── construct.ts        # Media analyzer (58 lines)
├── sati.ts                     # Frontend specialist
├── trinity.ts                  # Codebase search
├── operator.ts                 # Library research
├── mouse/            # Delegated task executor
│   ├── agent.ts
│   ├── default.ts              # Claude prompt
│   ├── gpt.ts                  # GPT prompt
│   └── index.ts
├── agent-builder.ts            # Agent builder utility
├── dynamic-agent-prompt-builder.ts  # Dynamic prompt generation (431 lines)
├── builtin-agents.ts          # Agent registry (factories + metadata maps)
├── utils.ts                    # Agent creation, model fallback resolution (571 lines)
├── types.ts                    # AgentModelConfig, AgentPromptMetadata
└── index.ts                    # Exports
```

## AGENT MODELS

| Agent | Model | Temp | Fallback Chain | Cost |
|-------|-------|------|----------------|------|
| Morpheus | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Keymaker | gpt-5.3-codex | 0.1 | gpt-5.2 (requires openai/github-copilot/venice/opencode) | EXPENSIVE |
| Seraph | <provider>/<model> | 0.3 | <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Oracle | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Architect | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Cipher | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Sentinel | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Merovingian | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Smith | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Auditor | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Construct | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Sati | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> | EXPENSIVE |
| Mouse | <provider>/<model> | 0.1 | (user-configurable via tier) | EXPENSIVE |
| Trinity | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> | CHEAP |
| Operator | <provider>/<model> | 0.1 | <provider>/<model> → <provider>/<model> → <provider>/<model> | CHEAP |

## TOOL RESTRICTIONS

An agent receives `task_*` iff `MODE ∈ {primary, all}` and its work is multi-step. The grant is derived from `mode` in `src/plugin-handlers/task-permissions.ts`, never from a name list, and the criterion is one-directional: `mode ∈ {primary, all}` ⇒ granted, never the converse. `Mouse` is the documented carve-out (`mode: "subagent"`, full task permissions — it owns the task-store records for the delegated work it runs). Full policy in `docs/task-system.md` §3.5.

| Agent | Mode | Denied | Allowed |
|-------|------|--------|---------|
| Merovingian | subagent | write, edit, task | Read-only consultation |
| Operator | subagent | write, edit, task | Research tools only |
| Trinity | subagent | write, edit, task | Search tools only |
| Construct | subagent | ALL except `read` | Vision-only |
| Mouse | subagent | — (task permitted, see carve-out) | `task_*` — owns its delegated task records |
| Architect | primary | — (task permitted) | `task_*`, teammate — orchestration only |
| Sentinel | all | write, edit, multiedit, `task` (delegation denied, `task_*` tracking allowed) | Read-only security auditing |
| Cipher | all | — | `task_*`, teammate — delegates per target language |
| Keymaker | primary | — | `task_*`, teammate |
| Bdd-contract | all | — | `task_*`, teammate |
| Auditor | subagent | write, edit, task | Read-only post-execution measurement; reports go to `.matrixx/reviews/`, never into the plan |

## THINKING / REASONING

| Agent | Claude | GPT |
|-------|--------|-----|
| Morpheus | 32k budget tokens | reasoningEffort: "medium" |
| Keymaker | — | reasoningEffort: "medium" |
| Oracle | 32k budget tokens | reasoningEffort: "medium" |
| Seraph | 32k budget tokens | — |
| Smith | 32k budget tokens | reasoningEffort: "medium" |
| Auditor | 32k budget tokens | reasoningEffort: "medium" |
| Sentinel | 32k budget tokens | reasoningEffort: "medium" |
| Mouse | 32k budget tokens | reasoningEffort: "medium" |

## HOW TO ADD

1. Create `src/agents/my-agent.ts` exporting factory + metadata
2. Add to `agentSources` **and** the metadata map in `src/agents/builtin-agents.ts` (a FILE, not a directory)
3. Re-export from `src/agents/index.ts`; add the name to `AgentName` in `src/agents/types.ts`
4. Add the name to `BuiltinAgentNameSchema` in `src/config/schema/agent-names.ts`
5. Add the entry to `AgentOverridesSchema` in `src/config/schema/agent-overrides.ts`
6. Add the name to the explore-agent set in `src/plugin-handlers/agent-config-handler.ts`
7. Add the name to `src/hooks/runtime-fallback/agent-resolver.ts`
8. Add tool restrictions in `src/shared/agent-tool-restrictions.ts`
9. Add model requirements in `src/shared/model-requirements.ts`
10. Add the display name in `src/shared/agent-display-names.ts`

## KEY PATTERNS

- **Factory**: `createXXXAgent(model): AgentConfig`
- **Metadata**: `XXX_PROMPT_METADATA` with category, cost, triggers
- **Model-specific prompts**: Architect, Mouse have GPT vs Claude variants
- **Dynamic prompts**: Morpheus, Keymaker use `dynamic-agent-prompt-builder.ts` to inject available tools/skills/categories

## ANTI-PATTERNS

- **Trust agent self-reports**: NEVER — always verify outputs
- **High temperature**: Don't use >0.3 for code agents
- **Sequential calls**: Use `task` with `run_in_background` for exploration
- **Oracle writing code**: Planner only — never implements
