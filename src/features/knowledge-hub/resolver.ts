import { isAbsolute, join, relative, resolve } from "node:path"
import type { LoadedHub } from "./loader"

function parseRef(ref: string): { name: string; relPath: string } | null {
  let rest: string | null = null
  if (ref.startsWith("hub:")) {
    rest = ref.slice("hub:".length)
  } else if (ref.startsWith("@")) {
    rest = ref.slice(1)
  } else {
    return null
  }
  const slash = rest.indexOf("/")
  if (slash === -1) {
    return { name: rest, relPath: "" }
  }
  return { name: rest.slice(0, slash), relPath: rest.slice(slash + 1) }
}

// Resolves `hub:name/path` and `@name/path` references to jailed
// absolute paths inside the hub root. Returns null on unknown hub,
// absolute-path input, or `..` escapes above the hub root.
export function resolveKnowledgeFile(hubs: LoadedHub[], ref: string): string | null {
  const parsed = parseRef(ref)
  if (parsed === null || parsed.name.length === 0) {
    return null
  }
  const hub = hubs.find((entry) => entry.name === parsed.name)
  if (!hub) {
    return null
  }
  if (parsed.relPath.length === 0) {
    return hub.indexPath
  }
  if (isAbsolute(parsed.relPath)) {
    return null
  }
  const normalizedBase = hub.root.endsWith("/") ? hub.root.slice(0, -1) : hub.root
  const candidate = resolve(join(normalizedBase, parsed.relPath))
  const rel = relative(normalizedBase, candidate)
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
    return null
  }
  if (rel.length === 0) {
    return hub.indexPath
  }
  return candidate
}
