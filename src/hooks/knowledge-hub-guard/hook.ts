import * as os from "node:os"
import * as path from "node:path"
import type { PluginInput } from "@opencode-ai/plugin"
import picomatch from "picomatch"
import type { LoadedHub } from "../../features/knowledge-hub/loader"
import { log } from "../../shared/logger"

const HOOK_NAME = "knowledge-hub-guard"

const WRITE_TOOLS = ["write", "edit", "multiedit"]

const DESTRUCTIVE_BASH_RE = /(^|[\s;&|])(rm|rmdir|mv|unlink|shred|tee)\b|sed\s+[^\s;|]*-i|>>?/
const DELETION_BASH_RE = /(^|[\s;&|])(rm|rmdir|mv|unlink|shred)\b/
const PATH_LIKE_RE = /[/.~]/
const FLAG_RE = /^-/
const VERBS = new Set([
  "sudo",
  "rm",
  "rmdir",
  "mv",
  "unlink",
  "shred",
  "tee",
  "sed",
  "echo",
  "truncate",
  "cp",
  "mkdir",
  "chmod",
  "chown",
  "touch",
  "printf",
  "cat",
])

export interface KnowledgeHubGuardOptions {
  hubs?: LoadedHub[]
  getHubs?: () => LoadedHub[]
}

function resolveTarget(target: string, projectDir: string): string {
  let expanded = target
  if (expanded === "~") {
    expanded = os.homedir()
  } else if (expanded.startsWith("~/")) {
    expanded = path.join(os.homedir(), expanded.slice(2))
  }
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded)
  }
  return path.resolve(projectDir, expanded)
}

function insideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate)
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

function isExcluded(hub: LoadedHub, absPath: string): boolean {
  const rel = path.relative(hub.root, absPath)
  const base = path.basename(absPath)
  return hub.exclude.some((pattern) => {
    const match = picomatch(pattern, { dot: true, bash: true })
    return match(rel) || match(absPath) || match(base)
  })
}

export function createKnowledgeHubGuardHook(ctx: PluginInput, options: KnowledgeHubGuardOptions = {}) {
  const projectDir = ctx.directory
  let cached: LoadedHub[] | null = null
  let warnedOnce = false

  const resolveHubs = (): LoadedHub[] => {
    if (cached !== null) {
      return cached
    }
    try {
      cached = options.getHubs?.() ?? options.hubs ?? []
    } catch {
      if (!warnedOnce) {
        warnedOnce = true
        log(`[${HOOK_NAME}] hub config unavailable, allowing writes (fail-open)`, {})
      }
      cached = []
    }
    return cached
  }

  const findBlockingHub = (absPath: string): LoadedHub | null => {
    for (const hub of resolveHubs()) {
      if (!insideRoot(hub.root, absPath)) {
        continue
      }
      if (isExcluded(hub, absPath)) {
        continue
      }
      return hub
    }
    return null
  }

  const deny = (hub: LoadedHub, absPath: string, tool: string, sessionID: string): never => {
    log(`[${HOOK_NAME}] blocked write inside hub`, { sessionID, tool, hub: hub.name })
    throw new Error(
      `[${HOOK_NAME}] Write blocked: "${absPath}" is inside knowledge hub "${hub.name}" (${hub.root}). ` +
        `Knowledge hubs are read-only; only paths matching the hub exclude list may be modified.`,
    )
  }

  const checkBash = (command: string, sessionID: string): void => {
    if (!DESTRUCTIVE_BASH_RE.test(command)) {
      return
    }
    const isDeletion = DELETION_BASH_RE.test(command)
    const tokens = command
      .split(/\s+/)
      .map((token) => token.replace(/^['"(`$]+|['";,)&|`]+$/g, ""))
      .filter((token) => token.length > 0)
    for (const token of tokens) {
      if (token === ">" || token === ">>" || FLAG_RE.test(token) || VERBS.has(token)) {
        continue
      }
      if (!isDeletion && !PATH_LIKE_RE.test(token)) {
        continue
      }
      const abs = resolveTarget(token, projectDir)
      const hub = findBlockingHub(abs)
      if (hub) {
        deny(hub, abs, "bash", sessionID)
      }
    }
  }

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      const tool = input.tool?.toLowerCase()
      if (tool === "bash") {
        const command = output.args?.command as string | undefined
        if (typeof command === "string" && command.length > 0) {
          checkBash(command, input.sessionID)
        }
        return
      }
      if (!WRITE_TOOLS.includes(tool)) {
        return
      }
      const args = output.args as unknown as Record<string, unknown>
      const filePath = (args?.filePath ?? args?.path ?? args?.file ?? args?.file_path) as string | undefined
      if (typeof filePath !== "string" || filePath.length === 0) {
        return
      }
      const abs = resolveTarget(filePath, projectDir)
      const hub = findBlockingHub(abs)
      if (hub) {
        deny(hub, abs, input.tool, input.sessionID)
      }
    },
  }
}
