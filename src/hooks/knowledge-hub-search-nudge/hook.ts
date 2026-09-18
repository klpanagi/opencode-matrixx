import type { PluginInput } from "@opencode-ai/plugin"
import type { LoadedHub } from "../../features/knowledge-hub/loader"
import { log } from "../../shared/logger"

const HOOK_NAME = "knowledge-hub-search-nudge"

const SEARCH_TOOLS = ["websearch", "webfetch"]

export interface KnowledgeHubSearchNudgeOptions {
  hubs?: LoadedHub[]
  getHubs?: () => LoadedHub[]
}

function buildNudge(hubs: LoadedHub[]): string {
  const names = hubs.map((hub) => `"${hub.name}"`).join(", ")
  return `Check knowledge hub(s) ${names} before searching the web; resolve files via @hub/path on demand, never bulk-read.`
}

export function createKnowledgeHubSearchNudgeHook(ctx: PluginInput, options: KnowledgeHubSearchNudgeOptions = {}) {
  void ctx
  let warnedOnce = false

  const resolveHubs = (): LoadedHub[] => {
    try {
      return options.getHubs?.() ?? options.hubs ?? []
    } catch {
      if (!warnedOnce) {
        warnedOnce = true
        log(`[${HOOK_NAME}] hub config unavailable, skipping nudge (fail-open)`, {})
      }
      return []
    }
  }

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown>; message?: string },
    ): Promise<void> => {
      try {
        const tool = input.tool?.toLowerCase()
        if (!SEARCH_TOOLS.includes(tool)) {
          return
        }
        const hubs = resolveHubs()
        if (hubs.length === 0) {
          return
        }
        output.message = buildNudge(hubs)
        log(`[${HOOK_NAME}] nudged on ${tool}`, {
          sessionID: input.sessionID,
          hubs: hubs.map((hub) => hub.name),
        })
      } catch {
        return
      }
    },
  }
}
