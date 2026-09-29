import { existsSync, statSync } from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { countPlanProgressFromContent, readPlanFile } from "../../features/mission-state"
import { readPlanFileSpan } from "../../features/mission-state/plan-storage"
import { parsePlanContract } from "../../features/plan-contract"
import type { PluginContext } from "../../plugin/types"
import { MAX_PLAN_FILE_BYTES, MAX_PLAN_READ_RENDERED_BYTES } from "./constants"
import { classifyReadRefusal, fileTooLargePayload, readFailedPayload } from "./error-codes"
import { clampManifestToRenderedBudget } from "./plan-tasks-clamp"
import { resolveDirectory, validatePlanFilePath } from "./types"

/**
 * Return the file's byte size when it exceeds the hard cap, else null, plus the
 * errno when stat itself failed. The errno is what separates a genuine
 * `read_failed` from a degraded manifest.
 */
function sizeOverHardCap(path: string): { size: number | null; errno: string | null } {
  try {
    const size = statSync(path).size
    return { size: size > MAX_PLAN_FILE_BYTES ? size : null, errno: null }
  } catch (error) {
    return { size: null, errno: (error as NodeJS.ErrnoException).code ?? "EUNKNOWN" }
  }
}

function truncationHint(shown: number, total: number): string {
  return `Showing the first ${shown} of ${total} tasks to fit the ${MAX_PLAN_READ_RENDERED_BYTES}-byte rendered budget — read the rest with plan_read using a section selector (e.g. section: 'todos')`
}

export function createPlanTasksTool(ctx?: PluginContext): ToolDefinition {
  return tool({
    description: `Return a compact manifest for a plan file: filePath, progress (total/completed/remaining/isComplete/needsTriage), numbered tasks (n, title, checked, line, LINE#ID anchor) and definition-of-done lines. Does NOT emit the plan body — use plan_read for content. A plan over the ${MAX_PLAN_FILE_BYTES}-byte cap still yields a manifest, marked degraded:true, because this tool never reads the body into your context; the manifest itself is clamped to ${MAX_PLAN_READ_RENDERED_BYTES} bytes and reports what it dropped. The cap is still enforced on every write.`,
    args: {
      filePath: tool.schema
        .string()
        .describe("Path to plan file (must be inside .matrixx/plans, kebab-case .md)"),
    },
    execute: async (args, context) => {
      try {
        const filePath = args.filePath as string
        const directory = resolveDirectory(
          (context as Record<string, unknown>)?.directory,
          (ctx as unknown as Record<string, unknown>)?.directory,
        )
        const validation = validatePlanFilePath(filePath, directory)
        if ("error" in validation) {
          return JSON.stringify({ error: "invalid_file_path", message: validation.error })
        }
        const resolved = validation.resolved
        if (!existsSync(resolved)) {
          return JSON.stringify({ error: "file_not_found", message: `File not found: ${resolved}` })
        }
        const probe = sizeOverHardCap(resolved)
        // The cap is a CEILING on what is HANDED BACK, never on what may be read.
        // An over-cap plan is still parsed (span reader) and still yields a manifest,
        // marked degraded — refusing it made a merely-large plan unplannable.
        const overCap = probe.size !== null
        const content = overCap ? readPlanFileSpan(resolved) : readPlanFile(resolved)
        if (content === null) {
          // Over the cap, the stat already succeeded, so a null span read can only be
          // a real read failure (stat needs no read permission) — never a size refusal.
          if (overCap) return readFailedPayload(resolved)
          const defensive = sizeOverHardCap(resolved)
          const refusal = classifyReadRefusal({ sizeOverCap: defensive.size, errno: defensive.errno })
          return refusal === "file_too_large" && defensive.size !== null
            ? fileTooLargePayload(resolved, defensive.size, MAX_PLAN_FILE_BYTES)
            : readFailedPayload(resolved, defensive.errno ?? undefined)
        }
        const progress = countPlanProgressFromContent(content)
        const contract = parsePlanContract(content)
        const buildProgress = () => ({
          total: progress.total,
          completed: progress.completed,
          remaining: progress.total - progress.completed,
          isComplete: progress.isComplete,
          ...(progress.needsTriage ? { needsTriage: true } : {}),
        })
        if (!overCap) {
          return JSON.stringify({
            filePath: resolved,
            progress: buildProgress(),
            tasks: contract.tasks,
            dod: contract.dod,
          })
        }
        const degraded = {
          reason: "file_over_cap",
          size: probe.size,
          cap: MAX_PLAN_FILE_BYTES,
          message: `Plan is ${probe.size} bytes, over the ${MAX_PLAN_FILE_BYTES}-byte cap. The manifest is returned anyway (this tool never emits the body); the cap still blocks every write.`,
        }
        const { payload } = clampManifestToRenderedBudget(
          contract.tasks,
          contract.dod,
          MAX_PLAN_READ_RENDERED_BYTES,
          (view) => ({
            filePath: resolved,
            degraded,
            progress: buildProgress(),
            tasks: view.tasks,
            dod: view.dod,
            ...(view.tasksTruncated
              ? {
                  tasksTruncated: view.tasksTruncated,
                  hint: truncationHint(view.tasksTruncated.shown, view.tasksTruncated.total),
                }
              : {}),
            ...(view.dodTruncated ? { dodTruncated: view.dodTruncated } : {}),
          }),
        )
        return JSON.stringify(payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({ error: "internal_error", message })
      }
    },
  })
}
