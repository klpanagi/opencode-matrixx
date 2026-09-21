import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type {
  AvailableCategory,
  AvailableSkill,
} from "../../agents/dynamic-agent-prompt-builder"
import { log } from "../../shared/logger"
import { mergeCategories } from "../../shared/merge-categories"
import { CATEGORY_DESCRIPTIONS, isCodeWritingCategory, SHORT_CATEGORY_HINTS } from "./constants"
import {
  executeBackgroundContinuation,
  executeBackgroundTask,
  executeSyncContinuation,
  executeSyncTask,
  executeUnstableAgentTask,
  resolveCategoryExecution,
  resolveParentContext,
  resolveSkillContent,
  resolveSubagentExecution,
} from "./executor"
import { MOUSE_AGENT } from "./mouse-agent"
import { buildSystemContent } from "./prompt-builder"
import type { DelegateTaskArgs, DelegateTaskToolOptions, ToolContextWithMetadata } from "./types"

export { resolveCategoryConfig } from "./categories"
export { buildSystemContent } from "./prompt-builder"
export type { BuildSystemContentInput, DelegateTaskToolOptions, SyncSessionCreatedEvent } from "./types"

/**
 * Fail-closed TDD enforcement for code-writing delegations (issue #127).
 * Returns a hard error string when the delegation must be rejected, else null.
 * Complexity: 1 — single exception path (source without the skill).
 */
export function requireTddEnforcerForCodeWriting(
  category: string | undefined,
  loadSkills: string[],
): string | null {
  // Construct-scope decision: enforce `source` only. `construct` also produces
  // UI code but shares prompts with design exploration, so requiring the skill
  // there would false-positive on non-code tasks. Category (not prompt sniffing)
  // is the signal. Fail-closed: an explicit global `tdd_enforcer.enabled === false`
  // opt-out does NOT exempt `source`, which by definition writes code.
  if (!isCodeWritingCategory(category)) {
    return null
  }
  if (loadSkills.includes("tdd-enforcer")) {
    return null
  }
  return (
    `TDD enforcement (issue #127): category "source" writes code and requires ` +
    `load_skills to include "tdd-enforcer". Add "tdd-enforcer" to load_skills. ` +
    `See docs/quality.md Part B.`
  )
}

export function createDelegateTask(options: DelegateTaskToolOptions): ToolDefinition {
  const { userCategories } = options

  const allCategories = mergeCategories(userCategories)
  const categoryNames = Object.keys(allCategories)
  const categoryExamples = categoryNames.join(", ")
  const categoryHints = categoryNames
    .map((name) => (SHORT_CATEGORY_HINTS[name] ? `${name}(${SHORT_CATEGORY_HINTS[name]})` : name))
    .join(", ")

  const availableCategories: AvailableCategory[] = options.availableCategories
    ?? Object.entries(allCategories).map(([name, categoryConfig]) => {
      const userDesc = userCategories?.[name]?.description
      const builtinDesc = CATEGORY_DESCRIPTIONS[name]
      const description = userDesc || builtinDesc || "General tasks"
      return {
        name,
        description,
        model: categoryConfig.model,
      }
    })

  const availableSkills: AvailableSkill[] = options.availableSkills ?? []

      const description = `[DELEGATION — spawns a subagent that does work. Does NOT create a tracking record.]
Spawn agent task with category-based or direct agent selection.

REQUIRED: You MUST provide EITHER category OR subagent_type (one of them is REQUIRED, but not both).
- If using a predefined category → provide category
- If using a specific agent → provide subagent_type
- Providing NEITHER is INVALID and will fail.

- load_skills: ALWAYS REQUIRED. Pass at least one skill name (e.g., ["playwright"], ["git-master", "frontend-ui-ux"]). Code-writing categories (source) MUST include "tdd-enforcer" (see docs/quality.md Part B).
- category: Use predefined category → Spawns Mouse with category config. Available: ${categoryHints} (full per-category guidance is injected at execution time; see category arg).
- subagent_type: Use specific agent directly (e.g., "oracle", "trinity")
- run_in_background: true=async (returns task_id), false=sync (waits for result). Default: false. Use true for ANY parallel independent work (exploration, fan-out, multi-agent waves); false awaits the result inline.
- session_id: Existing Task session to continue (from previous task output). Continues agent with FULL CONTEXT PRESERVED - saves tokens, maintains continuity. See session_id arg for when to use it.
- command: The command that triggered this task (optional, for slash command tracking).

Prompts MUST be in English.

Do NOT confuse with task_create/task_update/task_list/task_get/task_cleanup (the [TRACKING] family): those only write local T-{uuid} progress records and execute nothing. To get work done by another agent, use THIS tool (task).`

  return tool({
    description,
    args: {
      load_skills: tool.schema.array(tool.schema.string()).describe("Skill names to inject. REQUIRED - pass [] if no skills needed."),
      description: tool.schema.string().describe("Short task description (3-5 words)"),
      prompt: tool.schema.string().describe("Full detailed prompt for the agent"),
      run_in_background: tool.schema.boolean().default(false).describe("true=async (returns task_id), false=sync (waits). Default: false"),
      category: tool.schema.string().optional().describe(`REQUIRED if subagent_type not provided. Do NOT provide both category and subagent_type. Available: ${categoryExamples}. Per-category model/temperature/skills guidance is injected at execution time.`),
      subagent_type: tool.schema.string().optional().describe("REQUIRED if category not provided. Do NOT provide both category and subagent_type."),
      session_id: tool.schema.string().optional().describe("Existing Task session to continue (full context preserved). Use when: task failed/incomplete (fix: <issue>), follow-up on previous result, or multi-turn with same agent. NEVER start fresh for follow-ups."),
      command: tool.schema.string().optional().describe("The command that triggered this task"),
      complexity: tool.schema.union([
        tool.schema.literal(1),
        tool.schema.literal(2),
        tool.schema.literal(3),
        tool.schema.literal(4),
        tool.schema.literal(5),
        tool.schema.literal("auto"),
      ]).optional().default("auto").describe(
        "Task complexity (1-5) or 'auto' for automatic scoring. Levels 1-2 may use cheaper models."
      ),
    },
    async execute(args: DelegateTaskArgs, toolContext) {

      const ctx = toolContext as ToolContextWithMetadata

      if (args.category) {
        if (args.subagent_type && args.subagent_type !== MOUSE_AGENT) {
          log("[task] category provided - overriding subagent_type to mouse", {
            category: args.category,
            subagent_type: args.subagent_type,
          })
        }
        args.subagent_type = MOUSE_AGENT
      }
      await ctx.metadata?.({
        title: args.description,
      })

      // ── Four-option analysis (T4 reconciliation, behavioural conservation):
      //   (a) flip default to true → REJECTED. Silently fire-and-forgets every
      //       single-shot delegation; sync callers awaiting a result would receive
      //       a task_id instead of content — breaking change across all agents/templates.
      //   (b) keep false + fix prompt text → RECOMMENDED. Zero behavioural change;
      //       removes the "ONLY … 5+ queries" restriction so text matches the repo
      //       directive (AGENTS.md:223: "never sequential task() calls; use
      //       run_in_background=true and collect via background_output"). Cheapest,
      //       safest, reviewable as a text diff.
      //   (c) per-category default → REJECTED. Category matrix already complex; adds a
      //       second default source and per-category surprise; no requester asked for
      //       divergent sync/async per category.
      //   (d) warn on serialized task() calls → REJECTED as a blocker-gate (new
      //       detection subsystem, hook wiring, false-positive risk on legitimately
      //       sequential chains); accepted only as a future docs-lint idea.
      //   sameProviderPolicy: symbol does not exist (rg EMPTY); no provider-policy knob
      //     added.
      // ── Coercion: honor the schema's documented "Default: false".
      //   Zod .default() is not applied at runtime by the OpenCode plugin tool executor,
      //   so we apply the default here. Defense-in-depth: throw only for invalid types.
      if (args.run_in_background === undefined) {
        args.run_in_background = false
      } else if (typeof args.run_in_background !== "boolean") {
        throw new Error(`Invalid arguments: 'run_in_background' must be a boolean, got ${typeof args.run_in_background}.`)
      }
      if (typeof args.load_skills === "string") {
        try {
          const parsed = JSON.parse(args.load_skills)
          args.load_skills = Array.isArray(parsed) ? parsed : []
        } catch {
          args.load_skills = []
        }
      }
      if (args.load_skills === undefined) {
        throw new Error(`Invalid arguments: 'load_skills' parameter is REQUIRED. Pass [] if no skills needed.`)
      }
      if (args.load_skills === null) {
        throw new Error(`Invalid arguments: load_skills=null is not allowed. Pass [] if no skills needed.`)
      }

      const tddError = requireTddEnforcerForCodeWriting(args.category, args.load_skills)
      if (tddError) {
        throw new Error(tddError)
      }

      const runInBackground = args.run_in_background === true

      const { content: skillContent, error: skillError } = await resolveSkillContent(args.load_skills, {
        browserProvider: options.browserProvider,
        disabledSkills: options.disabledSkills,
      })
      if (skillError) {
        return skillError
      }

      const parentContext = await resolveParentContext(ctx, options.client)

      if (args.session_id) {
        if (runInBackground) {
          return executeBackgroundContinuation(args, ctx, options, parentContext)
        }
        return executeSyncContinuation(args, ctx, options)
      }

      if (!args.category && !args.subagent_type) {
        return `Invalid arguments: Must provide either category or subagent_type.`
      }

      let systemDefaultModel: string | undefined
      try {
        const openCodeConfig = await options.client.config.get()
        systemDefaultModel = (openCodeConfig as { data?: { model?: string } })?.data?.model
      } catch {
        systemDefaultModel = undefined
      }

      const inheritedModel = parentContext.model
        ? `${parentContext.model.providerID}/${parentContext.model.modelID}`
        : undefined

      let agentToUse: string
      let categoryModel: { providerID: string; modelID: string; variant?: string; temperature?: number } | undefined
      let categoryPromptAppend: string | undefined
      let modelInfo: import("../../features/task-toast-manager/types").ModelFallbackInfo | undefined
      let actualModel: string | undefined
      let isUnstableAgent = false

      if (args.category) {
        // ctx.sessionID is the invoking (parent) session — its preset overlay
        // propagates to the delegated task's category resolution.
        const resolution = await resolveCategoryExecution(args, { ...options, sessionID: ctx.sessionID }, inheritedModel, systemDefaultModel)
        if (resolution.error) {
          return resolution.error
        }
        agentToUse = resolution.agentToUse
        categoryModel = resolution.categoryModel
        categoryPromptAppend = resolution.categoryPromptAppend
        modelInfo = resolution.modelInfo
        actualModel = resolution.actualModel
        isUnstableAgent = resolution.isUnstableAgent

        const isRunInBackgroundExplicitlyFalse = args.run_in_background === false || args.run_in_background === "false" as unknown as boolean

        log("[task] unstable agent detection", {
          category: args.category,
          actualModel,
          isUnstableAgent,
          run_in_background_value: args.run_in_background,
          run_in_background_type: typeof args.run_in_background,
          isRunInBackgroundExplicitlyFalse,
          willForceBackground: isUnstableAgent && isRunInBackgroundExplicitlyFalse,
        })

        if (isUnstableAgent && isRunInBackgroundExplicitlyFalse) {
          const systemContent = buildSystemContent({
            skillContent,
            categoryPromptAppend,
            agentName: agentToUse,
            category: args.category,
            availableCategories,
            availableSkills,
          })
          return executeUnstableAgentTask(args, ctx, options, parentContext, agentToUse, categoryModel, systemContent, actualModel)
        }
      } else {
        const resolution = await resolveSubagentExecution(args, options, parentContext.agent, categoryExamples)
        if (resolution.error) {
          return resolution.error
        }
        agentToUse = resolution.agentToUse
        categoryModel = resolution.categoryModel
      }

      const systemContent = buildSystemContent({
        skillContent,
        categoryPromptAppend,
        agentName: agentToUse,
        category: args.category,
        availableCategories,
        availableSkills,
      })

      if (runInBackground) {
        return executeBackgroundTask(args, ctx, options, parentContext, agentToUse, categoryModel, systemContent)
      }

      return executeSyncTask(args, ctx, options, parentContext, agentToUse, categoryModel, systemContent, modelInfo)
    },
  })
}
