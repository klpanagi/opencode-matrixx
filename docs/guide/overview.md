# Matrixx Overview

> **Audience:** new users. **Version:** 2.6.10.
> **See also:** `installation.md` (setup), `../features.md` (capability index), `../orchestration.md` (how work runs).

Learn about Matrixx, a plugin that transforms OpenCode into the best agent harness.

---

## TL;DR

> **Model defaults matter.** The bundled config pins a model per agent and category (see the [Configuration Guide](../configurations.md)); run `opencode models` to see what is available in your environment. Swapping defaults may degrade orchestration quality.

**Feeling lazy?** Just include `ultrawork` (or `ulw`) in your prompt. That's it. The agent figures out the rest.

**Need precision?** Press **Tab** to enter Oracle (Planner) mode, create a work plan through an interview process, then run `/start-work` to execute it with full orchestration.

---

## What Matrixx Does for You

- **Build features from descriptions**: Just tell the agent what you want. It makes a plan, writes the code, and ensures it works. Automatically. You don't have to care about the details.
- **Debug and fix issues**: Describe a bug or paste an error. The agent analyzes your codebase, identifies the problem, and implements a fix.
- **Navigate any codebase**: Ask anything about your codebase. The agent maintains awareness of your entire project structure.
- **Automate tedious tasks**: Fix lint issues, resolve merge conflicts, write release notes - all in a single command.

---

## Two Ways to Work

### Option 1: Ultrawork Mode (For Quick Work)

If you're feeling lazy, just include **`ultrawork`** (or **`ulw`**) in your prompt:

```
ulw add authentication to my Next.js app
```

The agent will automatically:
1. Explore your codebase to understand existing patterns
2. Research best practices via specialized agents
3. Implement the feature following your conventions
4. Verify with diagnostics and tests
5. Keep working until complete

This is the "just do it" mode. Full automatic mode.
The agent is already smart enough, so it explores the codebase and make plans itself.
**You don't have to think that deep. Agent will think that deep.**

### Option 2: Oracle Mode (For Precise Work)

For complex or critical tasks, press **Tab** to switch to Oracle (Planner) mode.

**How it works:**

1. **Oracle interviews you** - Gathers requirements through structured interview, researching your codebase to understand exactly what you need before generating a work plan.

2. **Plan generation** - Based on the interview, Oracle generates a detailed work plan with tasks, acceptance criteria, and guardrails. Optionally reviewed by Smith (plan reviewer) for high-accuracy validation.

3. **Run `/start-work`** - The Architect takes over:
   - Distributes tasks to specialized sub-agents
   - Verifies each task completion independently
   - Accumulates learnings across tasks
   - Tracks progress across sessions (resume anytime)

**When to use Oracle:**
- Multi-day or multi-session projects
- Critical production changes
- Complex refactoring spanning many files
- When you want a documented decision trail

---

## Critical Usage Guidelines

### Always Use Oracle + Orchestrator Together

**Do NOT use `architect` without `/start-work`.**

The orchestrator is designed to execute work plans created by Oracle. Using it directly without a plan leads to unpredictable behavior.

**Correct workflow:**
```
1. Press Tab → Enter Oracle mode
2. Describe work → Oracle interviews you
3. Confirm plan → Review .matrixx/plans/*.md
4. Run /start-work → Orchestrator executes
```

**Oracle and Architect are a pair. Always use them together.**

---

## Model Configuration

Matrixx automatically configures models based on your available providers. You don't need to manually specify every model.

### How Models Are Determined

**1. At Installation Time (Interactive Installer)**

When you run `bunx opencode-matrixx install`, the installer asks which providers you have:
- Claude Pro/Max subscription?
- OpenAI/ChatGPT Plus?
- Google Gemini?
- GitHub Copilot?
- OpenCode Zen?
- Z.ai Coding Plan?

Based on your answers, it generates `~/.config/opencode/matrixx.jsonc` with optimal model assignments for each agent and category.

**2. At Runtime (Fallback Chain)**

Each agent has a **provider priority chain**. The system tries providers in order until it finds an available model:

```
Example: source
strongest: opencode/kimi-k2.5-free
   ↓
balanced: opencode/glm-5-free
   ↓
fast/cheap: opencode/deepseek-v4-flash-free
```

Each slot names a tier, not a fixed model. The chain names providers in your order
of preference, so which concrete model a slot resolves to depends on which providers
you actually have connected. The free OpenCode IDs shown above work out of the box
for anyone.

If the first provider is connected, its model is used. If not, the next one is
tried, and so on down the chain.

### Example Configuration

Here's a real-world config for a user with several providers available, where
the agent-to-model mappings express role intent (strongest for architecture,
cheap for trivial work):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/klpanagi/opencode-matrixx/refs/heads/dev/dist/matrixx.schema.json",
  "agents": {
    // Override specific agents only - rest use fallback chain
    "architect": { "model": "opencode/kimi-k2.5-free", "variant": "max" },
    "operator": { "model": "zai-coding-plan/glm-4.7" },
    "trinity": { "model": "opencode/deepseek-v4-flash-free" },
    "construct": { "model": "opencode/qwen3.6-plus-free" }
  },
  "categories": {
    // Override categories for cost optimization
    "bullet-time": { "model": "opencode/ling-3.0-flash-free" },
    "broadcast": { "model": "opencode/nemotron-3-super-free" }
  },
  "experimental": {
    "aggressive_truncation": true
  }
}
```

**Key points:**
- You only need to override what you want to change
- Unspecified agents/categories use the automatic fallback chain
- Mix providers freely — a strong model for main work, a cheap model for trivial tasks

### Finding Available Models

Run `opencode models` to see all available models in your environment. Model names follow the format `provider/model-name`.

### Learn More

For detailed configuration options including per-agent settings, category customization, and more, see the [Configuration Guide](../configurations.md).

---

## Next Steps

- [Matrixx Orchestration](../orchestration.md) - Deep dive into Oracle → Architect → Mouse workflow
- [Ultrawork mode](../command-reference.md) - `/ultrawork` toggle and ultrawork workflow
- [Installation Guide](./installation.md) - Detailed installation instructions
- [Configuration Guide](../configurations.md) - Customize agents, models, and behaviors
- [Features Reference](../features.md) - Complete feature documentation
