import * as fs from "node:fs"
import { resolve as resolvePath } from "node:path"

const FEATURE_SUFFIX = /\.feature$/i

export function isFeaturePath(input: string): boolean {
  return FEATURE_SUFFIX.test(input)
}

export function looksLikeGlob(input: string): boolean {
  return /[*?[\]{}]/.test(input)
}

export function listFeatureFilesInDir(input: string): string[] {
  if (!fs.existsSync(input)) return []
  const stat = fs.statSync(input)
  if (stat.isFile()) {
    return isFeaturePath(input) ? [resolvePath(input)] : []
  }
  if (!stat.isDirectory()) return []
  return walkFeatures(resolvePath(input))
}

function walkFeatures(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = resolvePath(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      out.push(...walkFeatures(full))
    } else if (entry.isFile() && FEATURE_SUFFIX.test(entry.name)) {
      out.push(full)
    }
  }
  return out.sort()
}

export function expandGlob(input: string): string[] {
  if (!looksLikeGlob(input)) {
    return listFeatureFilesInDir(input)
  }
  const [pattern, ...rest] = input.split("/")
  const anchor = resolvePath(pattern)
  if (fs.existsSync(anchor) && fs.statSync(anchor).isDirectory()) {
    return walkFeaturesGlob(anchor, rest.join("/") || "**/*.feature")
  }
  return []
}

function walkFeaturesGlob(root: string, pattern: string): string[] {
  const re = globToRegExp(pattern)
  const out: string[] = []
  walk(root, out, re)
  return out.sort()
}

function walk(dir: string, out: string[], re: RegExp): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = resolvePath(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      walk(full, out, re)
    } else if (entry.isFile()) {
      const rel = full.replace(`${dir}/`, "")
      if (re.test(rel)) out.push(full)
    }
  }
}

function globToRegExp(pattern: string): RegExp {
  const re = pattern
    .replace(/[.+^$()|\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*")
  return new RegExp(`^${re}$`)
}

export function resolveFeaturePaths(inputs: string[]): string[] {
  const seen = new Set<string>()
  for (const input of inputs) {
    const resolved = expandGlob(input)
    for (const f of resolved) seen.add(f)
  }
  return [...seen]
}
