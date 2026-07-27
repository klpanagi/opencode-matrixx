# Loader Removal & Simplification Plan

## Executive Summary

Remove all local directory loaders from Matrixx. Built-in skills/commands/agents/MCPs will be registered directly via OpenCode's `config` hook. This eliminates ~7,169 LOC across 42 files and removes Claude Code compatibility layers.

**What we're removing:**
- `src/features/opencode-skill-loader/` (17 files, ~2850 LOC) — loads skills from `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`, and config sources
- `src/features/command-loader/` (3 files, ~300 LOC) — loads commands from `.opencode/command/`
- `src/features/agent-loader/` (3 files, ~200 LOC) — loads agents from `.opencode/agents/`
- `src/features/mcp-oauth/` (7 files, ~2050 LOC) — OAuth 2.0 for MCP servers
- `src/features/skill-mcp-manager/` (12 files, ~1769 LOC) — MCP client lifecycle per session

**What we're keeping:**
- `src/features/builtin-skills/` — 45 built-in skills (code, not loaded from disk)
- `src/features/builtin-commands/` — built-in commands (code, not loaded from disk)
- `src/agents/` — 14 built-in agents (code, not loaded from disk)
- `src/mcp/` — 4 built-in MCPs (code, not loaded from disk)

---

## Current Architecture

### Skill Loading Pipeline

```
createSkillContext() [src/plugin/skill-context.ts]
  ├─ discoverConfigSourceSkills()     ← matrixx.jsonc skills.sources paths
  ├─ discoverOpencodeGlobalSkills()   ← ~/.config/opencode/skills/
  ├─ discoverOpencodeProjectSkills()  ← .opencode/skills/
  ├─ discoverProjectAgentsSkills()    ← .agents/skills/ (project)
  ├─ discoverGlobalAgentsSkills()     ← ~/.agents/skills/ (global)
  ├─ createBuiltinSkills()            ← 45 built-in skills (KEEP)
  └─ mergeSkills()                    ← priority-based merging
      ↓
  mergedSkills: LoadedSkill[]
      ↓
  ├─ createToolRegistry()             ← skill tool, slashcommand tool
  ├─ command-config-handler.ts        ← registered as commands
  ├─ agent-config-handler.ts          ← agent configs with skill awareness
  └─ auto-slash-command hook          ← auto-detection
```

### Command Loading Pipeline

```
applyCommandConfig() [src/plugin-handlers/command-config-handler.ts]
  ├─ loadBuiltinCommands()            ← Matrixx built-in commands (KEEP)
  ├─ loadOpencodeGlobalCommands()     ← ~/.config/opencode/command/
  ├─ loadOpencodeProjectCommands()    ← .opencode/command/
  ├─ skillsToCommandDefinitionRecord() ← skills converted to commands
  └─ pluginComponents.commands/skills ← (currently empty)
      ↓
  params.config.command = { ...merged }
```

### Agent Loading Pipeline

```
applyAgentConfig() [src/plugin-handlers/agent-config-handler.ts]
  ├─ createBuiltinAgents()            ← 14 built-in agents (KEEP)
  ├─ createMouseAgentWithOverrides()  ← Mouse agent (KEEP)
  ├─ loadUserAgents()                 ← ~/.config/opencode/agents/
  ├─ loadProjectAgents()              ← .opencode/agents/
  └─ pluginComponents.agents          ← (currently empty)
      ↓
  params.config.agent = { ...merged }
```

### MCP Loading Pipeline

```
applyMcpConfig() [src/plugin-handlers/mcp-config-handler.ts]
  ├─ createBuiltinMcps()              ← 4 built-in MCPs (KEEP)
  ├─ userMcp                          ← user config
  └─ pluginComponents.mcpServers      ← (currently empty)
      ↓
  params.config.mcp = { ...merged }

SkillMcpManager [src/features/skill-mcp-manager/]
  └─ Manages MCP lifecycle for skills with embedded MCPs
```

---

## Target Architecture

### Skill Loading Pipeline (Simplified)

```
createSkillContext() [src/plugin/skill-context.ts]
  ├─ createBuiltinSkills()            ← 45 built-in skills
  └─ filterDisabledSkills()           ← remove disabled_skills
      ↓
  builtinSkills: BuiltinSkill[]
      ↓
  ├─ createToolRegistry()             ← skill tool, slashcommand tool
  ├─ command-config-handler.ts        ← registered as commands
  ├─ agent-config-handler.ts          ← agent configs with skill awareness
  └─ auto-slash-command hook          ← auto-detection
```

### Command Loading Pipeline (Simplified)

```
applyCommandConfig() [src/plugin-handlers/command-config-handler.ts]
  ├─ loadBuiltinCommands()            ← Matrixx built-in commands
  └─ builtinSkillsToCommands()        ← built-in skills as commands
      ↓
  params.config.command = { ...merged }
```

### Agent Loading Pipeline (Simplified)

```
applyAgentConfig() [src/plugin-handlers/agent-config-handler.ts]
  ├─ createBuiltinAgents()            ← 14 built-in agents
  └─ createMouseAgentWithOverrides()  ← Mouse agent
      ↓
  params.config.agent = { ...merged }
```

### MCP Loading Pipeline (Simplified)

```
applyMcpConfig() [src/plugin-handlers/mcp-config-handler.ts]
  ├─ createBuiltinMcps()              ← 4 built-in MCPs
  └─ userMcp                          ← user config
      ↓
  params.config.mcp = { ...merged }

[SkillMcpManager removed — OpenCode handles MCP lifecycle]
```

---

## Phase 1: Simplify Skill Context

### Objectives
- Remove all discovery functions from `opencode-skill-loader`
- `createSkillContext()` should only use `createBuiltinSkills()`
- Remove `mergeSkills()` — no longer needed

### Tasks

1. **Refactor `src/plugin/skill-context.ts`**
   - Remove imports: `discoverConfigSourceSkills`, `discoverGlobalAgentsSkills`, `discoverOpencodeGlobalSkills`, `discoverOpencodeProjectSkills`, `discoverProjectAgentsSkills`, `mergeSkills`
   - Remove `SkillScope` type (no longer needed)
   - Simplify `createSkillContext()`:
     ```typescript
     export async function createSkillContext(args: {
       directory: string
       pluginConfig: MatrixxConfig
     }): Promise<SkillContext> {
       const { pluginConfig } = args
       
       const browserProvider = pluginConfig.browser_automation_engine?.provider ?? "playwright"
       const disabledSkills = new Set<string>(pluginConfig.disabled_skills ?? [])
       if (!pluginConfig.tdd_enforcer?.enabled) {
         disabledSkills.add("tdd-enforcer")
       }
       
       const builtinSkills = createBuiltinSkills({
         browserProvider,
         disabledSkills,
       })
       
       const availableSkills: AvailableSkill[] = builtinSkills.map((skill) => ({
         name: skill.name,
         description: skill.description,
         location: "plugin",
       }))
       
       return {
         builtinSkills,
         availableSkills,
         browserProvider,
         disabledSkills,
       }
     }
     ```
   - Update `SkillContext` type:
     ```typescript
     export type SkillContext = {
       builtinSkills: BuiltinSkill[]  // was: mergedSkills: LoadedSkill[]
       availableSkills: AvailableSkill[]
       browserProvider: BrowserAutomationProvider
       disabledSkills: Set<string>
     }
     ```

2. **Update `src/create-tools.ts`**
   - Change `mergedSkills: LoadedSkill[]` to `builtinSkills: BuiltinSkill[]`
   - Update return type

3. **Update `src/create-hooks.ts`**
   - Change `mergedSkills: LoadedSkill[]` to `builtinSkills: BuiltinSkill[]`

4. **Update `src/plugin/hooks/create-skill-hooks.ts`**
   - Change `LoadedSkill` to `BuiltinSkill`

### Deliverables
- `src/plugin/skill-context.ts` simplified to ~40 LOC
- All references to `LoadedSkill` replaced with `BuiltinSkill`
- No more skill discovery from disk

### Testing
- Verify `createSkillContext()` returns only built-in skills
- Verify `disabled_skills` config still works
- Verify `browserProvider` selection still works

### Risks
- **Medium**: Many files import `LoadedSkill` — need to update all of them
- **Mitigation**: Use grep to find all imports, update systematically

---

## Phase 2: Simplify Command Config

### Objectives
- Remove `loadOpencodeGlobalCommands()`, `loadOpencodeProjectCommands()`
- `applyCommandConfig()` should only use `loadBuiltinCommands()`
- Remove skill-to-command conversion (skills are registered separately)

### Tasks

1. **Refactor `src/plugin-handlers/command-config-handler.ts`**
   - Remove imports: `loadOpencodeGlobalCommands`, `loadOpencodeProjectCommands`, `discoverConfigSourceSkills`, `loadOpencodeGlobalSkills`, `loadOpencodeProjectSkills`, `skillsToCommandDefinitionRecord`
   - Simplify `applyCommandConfig()`:
     ```typescript
     export async function applyCommandConfig(params: {
       config: Record<string, unknown>;
       pluginConfig: MatrixxConfig;
       ctx: { directory: string };
       pluginComponents: PluginComponents;
     }): Promise<void> {
       const builtinCommands = loadBuiltinCommands(params.pluginConfig.disabled_commands);
       const systemCommands = (params.config.command as Record<string, unknown>) ?? {};
       
       params.config.command = {
         ...builtinCommands,
         ...systemCommands,
         ...params.pluginComponents.commands,
         ...params.pluginComponents.skills,
       };
     }
     ```

2. **Update `src/features/builtin-commands/`**
   - Remove import of `CommandDefinition` from `command-loader`
   - Define `CommandDefinition` locally or in a shared types file

### Deliverables
- `command-config-handler.ts` simplified to ~20 LOC
- No more command discovery from disk
- `command-loader/` can be deleted

### Testing
- Verify all built-in commands still register
- Verify slash commands still work
- Verify `disabled_commands` config still works

### Risks
- **Low**: Command loading is straightforward
- **Mitigation**: Built-in commands are already well-tested

---

## Phase 3: Simplify Agent Config

### Objectives
- Remove `loadUserAgents()`, `loadProjectAgents()`
- `applyAgentConfig()` should only use `createBuiltinAgents()`

### Tasks

1. **Refactor `src/plugin-handlers/agent-config-handler.ts`**
   - Remove imports: `loadProjectAgents`, `loadUserAgents`, `discoverConfigSourceSkills`, `discoverOpencodeGlobalSkills`, `discoverOpencodeProjectSkills`
   - Remove skill discovery logic (lines 47-70)
   - Simplify agent loading:
     ```typescript
     const builtinAgents = await createBuiltinAgents(
       migratedDisabledAgents,
       params.pluginConfig.agents,
       params.ctx.directory,
       undefined,
       params.pluginConfig.categories,
       [],  // allDiscoveredSkills — now empty
       params.ctx.client,
       browserProvider,
       currentModel,
       disabledSkills,
       useTaskSystem,
       params.pluginConfig.global_model,
       availableToolNames,
     );
     
     const rawPluginAgents = params.pluginComponents.agents;
     const pluginAgents = Object.fromEntries(
       Object.entries(rawPluginAgents).map(([key, value]) => [
         key,
         value ? migrateAgentConfig(value as Record<string, unknown>) : value,
       ]),
     );
     
     // ... rest of the logic stays the same
     ```
   - Remove `loadUserAgents()` and `loadProjectAgents()` calls

2. **Update `src/agents/builtin-agents.ts`**
   - Remove `LoadedSkill` import
   - Update `createBuiltinAgents()` signature to not require skills array

3. **Update `src/agents/agent-builder.ts`**
   - Remove `resolveMultipleSkills` import
   - Simplify agent building to not resolve skills

4. **Update `src/agents/builtin-agents/available-skills.ts`**
   - Remove `LoadedSkill`, `SkillScope` imports
   - Simplify to use `BuiltinSkill` only

### Deliverables
- `agent-config-handler.ts` simplified
- No more agent discovery from disk
- `agent-loader/` can be deleted

### Testing
- Verify all 14 agents still register
- Verify agent overrides still work
- Verify `disabled_agents` config still works

### Risks
- **Medium**: Agent building is complex — need to carefully remove skill resolution
- **Mitigation**: Keep the core agent building logic, only remove disk loading

---

## Phase 4: Simplify MCP Config

### Objectives
- Remove `SkillMcpManager` from `createManagers()`
- Remove `mcp-oauth/` and `skill-mcp-manager/`
- `applyMcpConfig()` should only use `createBuiltinMcps()`

### Tasks

1. **Refactor `src/create-managers.ts`**
   - Remove `SkillMcpManager` import
   - Remove `skillMcpManager` from `Managers` type
   - Remove `new SkillMcpManager()` instantiation
   - Update return type

2. **Refactor `src/plugin-handlers/mcp-config-handler.ts`**
   - Already simple — no changes needed
   - Just verify it doesn't reference `SkillMcpManager`

3. **Update `src/create-tools.ts`**
   - Remove `skillMcpManager` from `managers` parameter
   - Update `createToolRegistry()` call

4. **Update `src/tools/skill/tools.ts`**
   - Remove `SkillMcpManager`, `SkillMcpClientInfo`, `SkillMcpServerContext` imports
   - Remove MCP-related logic from skill tool

5. **Update `src/tools/skill-mcp/tools.ts`**
   - Delete entire file — skill-mcp tool no longer needed

6. **Update `src/tools/skill/types.ts`**
   - Remove `SkillMcpManager` import
   - Remove `mcpConfig` from skill types

### Deliverables
- `SkillMcpManager` removed from codebase
- `mcp-oauth/` and `skill-mcp-manager/` can be deleted
- MCP lifecycle delegated to OpenCode

### Testing
- Verify all 4 built-in MCPs still start
- Verify MCP tools still work
- Verify `disabled_mcps` config still works

### Risks
- **High**: MCP lifecycle is complex — need to ensure OpenCode handles it correctly
- **Mitigation**: Test thoroughly with MCP-dependent skills (playwright, websearch)

---

## Phase 5: Delete Loader Modules

### Objectives
- Delete all 5 loader modules

### Tasks

1. **Delete directories:**
   ```bash
   rm -rf src/features/opencode-skill-loader/
   rm -rf src/features/command-loader/
   rm -rf src/features/agent-loader/
   rm -rf src/features/mcp-oauth/
   rm -rf src/features/skill-mcp-manager/
   ```

2. **Update `src/features/index.ts`** (if it exists)
   - Remove exports of deleted modules

3. **Update `src/features/AGENTS.md`**
   - Remove documentation for deleted modules

### Deliverables
- 5 directories deleted (~7,169 LOC removed)
- Clean feature set

### Testing
- Run `bun run typecheck` — should pass
- Run `bun run lint` — should pass
- Run `bun test` — should pass

### Risks
- **Low**: All dependencies should be resolved in previous phases
- **Mitigation**: If typecheck fails, fix remaining imports

---

## Phase 6: Update Config Schema

### Objectives
- Remove `skills.sources` from config schema (no longer needed)
- Remove `skills.enable`/`skills.disable` (use `disabled_skills` instead)

### Tasks

1. **Update `src/config/schema/skills.ts`**
   - Remove `sources` field
   - Remove `enable`/`disable` fields
   - Keep only `disabled_skills` at root level

2. **Regenerate schema:**
   ```bash
   bun run build:schema
   ```

3. **Update `dist/matrixx.schema.json`**
   - Should be auto-generated

### Deliverables
- Config schema simplified
- No more `skills.sources` configuration

### Testing
- Verify config validation still works
- Verify `disabled_skills` still works

### Risks
- **Low**: Config schema changes are straightforward
- **Mitigation**: Keep backward compatibility for one release cycle

---

## Phase 7: Update Dependencies

### Objectives
- Update all imports that reference deleted modules
- Remove `SkillMcpManager` from `Managers` type
- Remove `mergedSkills` from `SkillContext`

### Tasks

1. **Find all imports:**
   ```bash
   grep -r "from.*opencode-skill-loader" src/ --include="*.ts"
   grep -r "from.*command-loader" src/ --include="*.ts"
   grep -r "from.*agent-loader" src/ --include="*.ts"
   grep -r "from.*mcp-oauth" src/ --include="*.ts"
   grep -r "from.*skill-mcp-manager" src/ --include="*.ts"
   ```

2. **Update each file:**
   - Replace `LoadedSkill` with `BuiltinSkill`
   - Remove discovery function calls
   - Remove MCP-related logic

3. **Key files to update:**
   - `src/tools/slashcommand/command-discovery.ts`
   - `src/tools/slashcommand/types.ts`
   - `src/tools/slashcommand/slashcommand-tool.ts`
   - `src/tools/slashcommand/skill-command-converter.ts`
   - `src/tools/skill/types.ts`
   - `src/tools/skill/tools.ts`
   - `src/tools/skill-mcp/tools.ts` (delete)
   - `src/tools/delegate-task/skill-resolver.ts`
   - `src/hooks/auto-slash-command/executor.ts`
   - `src/hooks/auto-slash-command/hook.ts`
   - `src/agents/builtin-agents.ts`
   - `src/agents/agent-builder.ts`
   - `src/agents/builtin-agents/available-skills.ts`
   - `src/plugin/skill-context.ts`
   - `src/plugin/hooks/create-skill-hooks.ts`
   - `src/create-tools.ts`
   - `src/create-hooks.ts`
   - `src/create-managers.ts`
   - `src/plugin-handlers/command-config-handler.ts`
   - `src/plugin-handlers/agent-config-handler.ts`
   - `src/features/builtin-skills/types.ts`
   - `src/features/builtin-commands/types.ts`
   - `src/features/builtin-commands/commands.ts`

### Deliverables
- All imports updated
- No references to deleted modules

### Testing
- Run `bun run typecheck` — should pass
- Run `bun run lint` — should pass

### Risks
- **Medium**: Many files to update
- **Mitigation**: Use grep to find all imports, update systematically

---

## Phase 8: Testing & Validation

### Objectives
- Verify all functionality still works
- Ensure no regressions

### Tasks

1. **Type checking:**
   ```bash
   bun run typecheck
   ```

2. **Linting:**
   ```bash
   bun run lint
   ```

3. **Unit tests:**
   ```bash
   bun test
   ```

4. **Integration tests:**
   - Start OpenCode with Matrixx plugin
   - Verify all 45 built-in skills load
   - Verify all built-in commands work
   - Verify all 14 agents register
   - Verify all 4 built-in MCPs start
   - Test skill invocation via slash commands
   - Test agent delegation
   - Test MCP tools (websearch, context7, etc.)

5. **Manual testing:**
   - Create a new session
   - Invoke a built-in skill (e.g., `/git-master`)
   - Delegate to an agent (e.g., `@oracle`)
   - Use an MCP tool (e.g., websearch)
   - Verify no errors in logs

### Deliverables
- All tests pass
- No regressions

### Risks
- **High**: Complex system with many moving parts
- **Mitigation**: Test each component individually, then integration

---

## Phase 9: Documentation & Cleanup

### Objectives
- Update AGENTS.md files
- Update README.md
- Remove obsolete code comments

### Tasks

1. **Update `src/features/AGENTS.md`**
   - Remove documentation for deleted modules
   - Update structure diagram

2. **Update `src/AGENTS.md`**
   - Update plugin initialization steps
   - Remove references to deleted loaders

3. **Update `README.md`**
   - Remove mentions of local directory loading
   - Update configuration examples

4. **Remove obsolete comments:**
   - Search for "claude code", "local directory", "skill discovery"
   - Remove or update comments

5. **Update `docs/configurations.md`**
   - Remove `skills.sources` documentation
   - Update skill configuration examples

### Deliverables
- Documentation updated
- No obsolete references

### Testing
- Review documentation for accuracy
- Verify examples still work

### Risks
- **Low**: Documentation updates are straightforward
- **Mitigation**: Review carefully for accuracy

---

## Risk Mitigation

### High-Risk Areas

1. **MCP Lifecycle (Phase 4)**
   - **Risk**: OpenCode may not handle MCP lifecycle the same way as `SkillMcpManager`
   - **Mitigation**: Test thoroughly with MCP-dependent skills
   - **Fallback**: Keep `SkillMcpManager` if OpenCode's handling is insufficient

2. **Skill Resolution (Phase 3)**
   - **Risk**: Agent building may break without skill resolution
   - **Mitigation**: Keep core agent building logic, only remove disk loading
   - **Fallback**: Simplify skill resolution instead of removing it

3. **Import Updates (Phase 7)**
   - **Risk**: Many files to update, easy to miss some
   - **Mitigation**: Use grep to find all imports, update systematically
   - **Fallback**: Fix typecheck errors iteratively

### Medium-Risk Areas

1. **Config Schema Changes (Phase 6)**
   - **Risk**: Breaking change for users with `skills.sources` config
   - **Mitigation**: Keep backward compatibility for one release cycle
   - **Fallback**: Deprecate instead of remove

2. **Command Registration (Phase 2)**
   - **Risk**: Slash commands may break
   - **Mitigation**: Test all slash commands thoroughly
   - **Fallback**: Keep skill-to-command conversion

### Low-Risk Areas

1. **Agent Loading (Phase 3)**
   - **Risk**: Minimal — agent loading is straightforward
   - **Mitigation**: Built-in agents are well-tested

2. **Documentation (Phase 9)**
   - **Risk**: Minimal — documentation updates are straightforward
   - **Mitigation**: Review carefully for accuracy

---

## Rollback Strategy

If migration fails at any phase:

1. **Revert the phase:**
   ```bash
   git revert HEAD
   ```

2. **Restore deleted modules:**
   ```bash
   git checkout HEAD~1 -- src/features/opencode-skill-loader/
   git checkout HEAD~1 -- src/features/command-loader/
   git checkout HEAD~1 -- src/features/agent-loader/
   git checkout HEAD~1 -- src/features/mcp-oauth/
   git checkout HEAD~1 -- src/features/skill-mcp-manager/
   ```

3. **Revert import updates:**
   ```bash
   git checkout HEAD~1 -- src/
   ```

4. **Verify:**
   ```bash
   bun run typecheck
   bun run lint
   bun test
   ```

---

## Success Criteria

Migration is complete when:

- [ ] All 5 loader modules deleted
- [ ] ~7,169 LOC removed
- [ ] All 45 built-in skills load correctly
- [ ] All built-in commands work
- [ ] All 14 agents register
- [ ] All 4 built-in MCPs start
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun test` passes
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] No obsolete references remain

---

## Estimated Effort

| Phase | Complexity | Time Estimate |
|-------|-----------|---------------|
| Phase 1: Simplify Skill Context | Medium | 2-3 hours |
| Phase 2: Simplify Command Config | Low | 1 hour |
| Phase 3: Simplify Agent Config | Medium | 2-3 hours |
| Phase 4: Simplify MCP Config | High | 3-4 hours |
| Phase 5: Delete Loader Modules | Low | 30 minutes |
| Phase 6: Update Config Schema | Low | 1 hour |
| Phase 7: Update Dependencies | Medium | 3-4 hours |
| Phase 8: Testing & Validation | High | 4-5 hours |
| Phase 9: Documentation & Cleanup | Low | 1-2 hours |
| **Total** | | **18-24 hours** |

---

## Dependencies

```
Phase 1 (Skill Context)
  ↓
Phase 2 (Command Config) ──┐
  ↓                         │
Phase 3 (Agent Config) ────┤
  ↓                         │
Phase 4 (MCP Config) ──────┤
  ↓                         │
Phase 5 (Delete Modules) ←─┘
  ↓
Phase 6 (Config Schema)
  ↓
Phase 7 (Update Dependencies)
  ↓
Phase 8 (Testing)
  ↓
Phase 9 (Documentation)
```

**Critical path:** Phase 1 → Phase 7 → Phase 8

**Parallelizable:** Phases 2, 3, 4 can be done in parallel after Phase 1

---

## Code Changes Summary

### Files to Delete (42 files, ~7,169 LOC)

```
src/features/opencode-skill-loader/     (17 files)
src/features/command-loader/            (3 files)
src/features/agent-loader/              (3 files)
src/features/mcp-oauth/                 (7 files)
src/features/skill-mcp-manager/         (12 files)
```

### Files to Modify (~30 files)

```
src/plugin/skill-context.ts
src/create-tools.ts
src/create-hooks.ts
src/create-managers.ts
src/plugin/hooks/create-skill-hooks.ts
src/plugin-handlers/command-config-handler.ts
src/plugin-handlers/agent-config-handler.ts
src/tools/slashcommand/command-discovery.ts
src/tools/slashcommand/types.ts
src/tools/slashcommand/slashcommand-tool.ts
src/tools/slashcommand/skill-command-converter.ts
src/tools/skill/types.ts
src/tools/skill/tools.ts
src/tools/skill-mcp/tools.ts            (delete)
src/tools/delegate-task/skill-resolver.ts
src/hooks/auto-slash-command/executor.ts
src/hooks/auto-slash-command/hook.ts
src/agents/builtin-agents.ts
src/agents/agent-builder.ts
src/agents/builtin-agents/available-skills.ts
src/features/builtin-skills/types.ts
src/features/builtin-commands/types.ts
src/features/builtin-commands/commands.ts
src/config/schema/skills.ts
```

### Files to Create (0 files)

No new files needed — we're simplifying, not adding.

---

## API Mapping Table

### Before (v1 with loaders)

```typescript
// Skill loading
import { discoverOpencodeProjectSkills, mergeSkills } from "./features/opencode-skill-loader"
const skills = await discoverOpencodeProjectSkills(directory)
const merged = mergeSkills(builtinSkills, skills, ...)

// Command loading
import { loadOpencodeProjectCommands } from "./features/command-loader"
const commands = await loadOpencodeProjectCommands(directory)

// Agent loading
import { loadProjectAgents } from "./features/agent-loader"
const agents = loadProjectAgents(directory)

// MCP management
import { SkillMcpManager } from "./features/skill-mcp-manager"
const manager = new SkillMcpManager()
```

### After (v1 without loaders)

```typescript
// Skill loading
import { createBuiltinSkills } from "./features/builtin-skills"
const skills = createBuiltinSkills({ browserProvider, disabledSkills })

// Command loading
import { loadBuiltinCommands } from "./features/builtin-commands"
const commands = loadBuiltinCommands(disabledCommands)

// Agent loading
import { createBuiltinAgents } from "./agents"
const agents = await createBuiltinAgents(...)

// MCP management
import { createBuiltinMcps } from "./mcp"
const mcps = createBuiltinMcps(disabledMcps, config)
// OpenCode handles MCP lifecycle
```

---

## Notes

### Why v2 Migration Isn't Possible

OpenCode's plugin loader (`packages/opencode/src/plugin/index.ts`) only calls `readV1Plugin()`. There is no `readV2Plugin()` function. The v2 API exists in the `@opencode-ai/plugin` package but OpenCode's loader doesn't recognize or load v2 plugins. v2 is pre-release infrastructure — it's built but not wired up.

### Why Local Directory Loading Exists

Matrixx's loaders provide functionality OpenCode doesn't have natively:
- Local file discovery (`.opencode/skills/`, `.opencode/command/`)
- YAML frontmatter parsing
- Multi-scope priority merging
- Claude Code compatibility (`.claude/` paths)

However, the user has decided this functionality is not needed. Users should use OpenCode's native mechanisms (if/when they're added) or rely on Matrixx's built-in skills/commands.

### Backward Compatibility

This is a **breaking change**. Users with custom skills/commands/agents in `.opencode/` directories will lose that functionality. They should:
1. Use OpenCode's native mechanisms (if available)
2. Request features from Matrixx to be added as built-in skills/commands
3. Fork Matrixx and add custom loaders

### Future Work

If OpenCode adds native support for local directory loading in the future, Matrixx can re-add loaders that delegate to OpenCode's APIs. For now, we're simplifying to reduce maintenance burden.
