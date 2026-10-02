import type { Hooks } from "@opencode-ai/plugin"

import type { MatrixxConfig } from "../../config"
import { log } from "../../shared"
import { hasWorkingSubstitute, resolveContextModeEnforcement } from "../../shared/context-mode-enforcement"
import {
  BASH_ROUTED_MESSAGE,
  BLOCK_MESSAGE_GREP_GLOB,
  HOOK_NAME,
  WARN_MESSAGE_BASH_READ,
  WARN_MESSAGE_READ,
  WEBFETCH_BLOCK_MESSAGE,
} from "./constants"
import { shouldShowGuidance } from "./guidance-throttle"

const BASH_FILE_READ_RE = /^\s*(cat|head|tail)\s+/
const BASH_GREP_RE = /\bgrep\b/
const CURL_WGET_RE = /\b(curl|wget)\b/
const INLINE_HTTP_RE = /https?:\/\//
/**
 * Dev-loop commands (`bun run build`, `make`, `cargo test`) produce large,
 * analysis-shaped output but are not fetches. They are advisory-only so the
 * enforcer can never surprise an agent by blocking its build loop.
 */
const BUILD_TOOL_RE = /\b(bun|npm|pnpm|yarn|pip|cargo|go|make|docker)\s+(build|install|add|test|run)\b/

const GUIDANCE_READ = "read"
const GUIDANCE_GREP_GLOB = "grep-glob"
const GUIDANCE_WEBFETCH = "webfetch"
const GUIDANCE_BASH_FILE_READ = "bash-file-read"
const GUIDANCE_BASH_ROUTED = "bash-routed"

function resolveContextModeConfig(pluginConfig: MatrixxConfig) {
  const { enabled, enforce, blockedTools } = resolveContextModeEnforcement(pluginConfig.context_mode)
  return {
    enabled,
    enforce,
    blockedTools: new Set(blockedTools),
  }
}

export function createContextModeEnforcerHook(pluginConfig: MatrixxConfig): Hooks {
  const { enabled, enforce, blockedTools } = resolveContextModeConfig(pluginConfig)

  return {
    "tool.execute.before": async (input, output: { args: Record<string, unknown>; message?: string }): Promise<void> => {
      if (!enabled) return

      const tool = input.tool.toLowerCase()
      const isBlocked = blockedTools.has(tool)
      const isRead = tool === "read"
      const isGrepGlob = tool === "grep" || tool === "glob"
      const isWebfetch = tool === "webfetch"
      const isBash = tool === "bash"

      if (isBash) {
        const command = output.args.command
        if (typeof command !== "string") return
        const isFileRead = BASH_FILE_READ_RE.test(command)
        const isGrep = BASH_GREP_RE.test(command)
        const isFetchShaped = CURL_WGET_RE.test(command) || INLINE_HTTP_RE.test(command)
        const isBuildTool = BUILD_TOOL_RE.test(command)
        if (!isFileRead && !isGrep && !isFetchShaped && !isBuildTool) return

        const bashGated = blockedTools.has("bash")

        if (isFileRead || isGrep) {
          if (enforce && bashGated) {
            log(`[${HOOK_NAME}] BLOCKED bash file read`, {
              sessionID: input.sessionID,
              command: command.slice(0, 120),
            })
            throw new Error(`${BLOCK_MESSAGE_GREP_GLOB}\n\nBash command: ${command.slice(0, 200)}`)
          }
          if (!shouldShowGuidance(input.sessionID, GUIDANCE_BASH_FILE_READ)) return
          output.message = WARN_MESSAGE_BASH_READ
          log(`[${HOOK_NAME}] warned on bash`, { sessionID: input.sessionID, command: command.slice(0, 120) })
          return
        }

        if (enforce && bashGated && isFetchShaped) {
          log(`[${HOOK_NAME}] BLOCKED bash ${isBuildTool ? "fetch-shaped build tool" : "fetch"}`, {
            sessionID: input.sessionID,
            command: command.slice(0, 120),
          })
          throw new Error(`${BASH_ROUTED_MESSAGE}\n\nBash command: ${command.slice(0, 200)}`)
        }

        if (!shouldShowGuidance(input.sessionID, GUIDANCE_BASH_ROUTED)) return
        output.message = BASH_ROUTED_MESSAGE
        log(`[${HOOK_NAME}] routed bash (soft)`, {
          sessionID: input.sessionID,
          fetchShaped: isFetchShaped,
          command: command.slice(0, 120),
        })
        return
      }

      if (isWebfetch) {
        if (!isBlocked) return
        if (enforce && hasWorkingSubstitute()) {
          log(`[${HOOK_NAME}] BLOCKED webfetch`, { sessionID: input.sessionID })
          throw new Error(WEBFETCH_BLOCK_MESSAGE)
        }
        if (!shouldShowGuidance(input.sessionID, GUIDANCE_WEBFETCH)) return
        output.message = WEBFETCH_BLOCK_MESSAGE
        log(`[${HOOK_NAME}] warned on webfetch (soft)`, { sessionID: input.sessionID })
        return
      }

      if (isRead) {
        if (!isBlocked) return
        if (!shouldShowGuidance(input.sessionID, GUIDANCE_READ)) return
        output.message = WARN_MESSAGE_READ
        log(`[${HOOK_NAME}] warned on read (soft)`, { sessionID: input.sessionID })
        return
      }

      if (isGrepGlob) {
        if (!isBlocked) return
        if (enforce && hasWorkingSubstitute()) {
          log(`[${HOOK_NAME}] BLOCKED ${tool}`, { sessionID: input.sessionID })
          throw new Error(BLOCK_MESSAGE_GREP_GLOB)
        }
        if (!shouldShowGuidance(input.sessionID, GUIDANCE_GREP_GLOB)) return
        output.message = WARN_MESSAGE_READ
        log(`[${HOOK_NAME}] warned on ${tool} (soft)`, { sessionID: input.sessionID })
      }
    },
  }
}
