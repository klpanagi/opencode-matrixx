import { existsSync } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
  DEFAULT_KNOWLEDGE_EXCLUDES,
  type KnowledgeConfig,
  type KnowledgeHub,
} from "../../config/schema/knowledge"
import { log } from "../../shared/logger"

export interface LoadedHub {
  name: string
  root: string
  indexPath: string
  scope: KnowledgeHub["scope"]
  mode: KnowledgeHub["mode"]
  exclude: string[]
}

// Canonical path expansion for Task 5 to reuse (see TODO in
// src/hooks/knowledge-hub-injector/hook.ts). Leading `~` maps to
// os.homedir(); `$VAR` and `${VAR}` expand from process.env with a
// missing variable expanding to an empty string.
export function expandHubPath(rawPath: string, projectDir?: string): string {
  let expanded = rawPath
  if (expanded === "~") {
    expanded = os.homedir()
  } else if (expanded.startsWith("~/")) {
    expanded = path.join(os.homedir(), expanded.slice(2))
  }
  expanded = expanded.replace(/\$(\w+)|\$\{([^}]+)\}/g, (_, name: string, braced: string) => {
    const key = name ?? braced
    return process.env[key] ?? ""
  })
  if (path.isAbsolute(expanded)) {
    return path.normalize(expanded)
  }
  const base = projectDir ?? process.cwd()
  return path.normalize(path.join(base, expanded))
}

function mergeExcludes(userExclude: string[] | undefined): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const entry of [...(userExclude ?? []), ...DEFAULT_KNOWLEDGE_EXCLUDES]) {
    if (!seen.has(entry)) {
      seen.add(entry)
      merged.push(entry)
    }
  }
  return merged
}

function loadOneHub(hub: KnowledgeHub, projectDir?: string): LoadedHub | null {
  const root = expandHubPath(hub.path, projectDir)
  if (!existsSync(root)) {
    log("[knowledge-hub] hub path missing, skipping", { name: hub.name, root })
    return null
  }
  const indexPath = path.join(root, hub.index ?? "_index.md")
  if (!existsSync(indexPath)) {
    log("[knowledge-hub] hub index missing, skipping", { name: hub.name, indexPath })
    return null
  }
  return {
    name: hub.name,
    root,
    indexPath,
    scope: hub.scope ?? "global",
    mode: hub.mode ?? "router-only",
    exclude: mergeExcludes(hub.exclude),
  }
}

// Loads + validates hub entries. Warns via logger and skips missing
// hubs or missing index files; never throws on missing paths.
export function loadKnowledgeHubs(
  config: KnowledgeConfig | KnowledgeHub[],
  projectDir?: string
): LoadedHub[] {
  const hubs = Array.isArray(config) ? config : (config.hubs ?? [])
  const loaded: LoadedHub[] = []
  for (const hub of hubs) {
    try {
      const one = loadOneHub(hub, projectDir)
      if (one !== null) {
        loaded.push(one)
      }
    } catch {
      log("[knowledge-hub] hub load failed, skipping", { name: hub.name })
    }
  }
  return loaded
}
