import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { DEFAULT_GLOBS, IGNORED_DIRS, RULE_CATALOG, SEVERITY_RANK } from "./constants"
import type {
  ScanSeverity,
  SilentFailureFinding,
  SilentFailureScanResult,
  SilentFailureWaiver,
  SilentFailureWaiverWarning,
} from "./types"

interface ExceptBlock {
  headerLine: number
  bodyStart: number
  bodyEnd: number
  indent: number
}

interface GatherAssignment {
  variable: string
  line: number
  returnExceptions: boolean
}

function finding(
  rule: string,
  file: string,
  line: number,
  excerpt: string,
  symbol: string,
): SilentFailureFinding {
  const meta = RULE_CATALOG[rule]
  const severity: ScanSeverity = meta?.severity ?? "warn"
  return {
    rule,
    severity,
    file,
    line,
    excerpt: excerpt.trim().slice(0, 160),
    why: meta?.why ?? "Silent-failure anti-pattern.",
    fix: meta?.fix ?? "Handle the error explicitly.",
    symbol,
  }
}

function globToRegExp(glob: string): RegExp {
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        i += 1
        if (glob[i + 1] === "/") {
          i += 1
          re += "(?:.*/)?"
        } else {
          re += ".*"
        }
      } else {
        re += "[^/]*"
      }
    } else if (ch === "?") {
      re += "[^/]"
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      re += `\\${ch}`
    } else {
      re += ch
    }
  }
  return new RegExp(`^${re}$`)
}

function walkFiles(root: string, globs: string[]): string[] {
  const matchers = globs.map(globToRegExp)
  const found: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (dir === undefined) break
    let entries: import("node:fs").Dirent<string>[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      entries = []
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(root, full)
      if (matchers.some((m) => m.test(rel) || m.test(full))) found.push(full)
    }
  }
  return found.sort()
}

function collectFiles(target: string, globs: string[]): string[] {
  if (!existsSync(target)) return []
  const stats = statSync(target)
  if (stats.isFile()) return [target]
  return walkFiles(target, globs)
}

function displayPath(base: string, abs: string): string {
  const rel = relative(base, abs)
  return rel.startsWith("..") ? abs : rel
}

function meaningful(lines: string[], start: number, end: number): string[] {
  const out: string[] = []
  for (let i = start; i < end; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === "" || trimmed.startsWith("#")) continue
    out.push(line)
  }
  return out
}

function accumulateBalanced(
  lines: string[],
  startLine: number,
  startIndex: number,
  open: string,
  close: string,
): string {
  let depth = 0
  let text = ""
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    const from = i === startLine ? startIndex : 0
    for (let c = from; c < line.length; c++) {
      const ch = line[c]
      text += ch
      if (ch === open) depth += 1
      else if (ch === close) {
        depth -= 1
        if (depth === 0) return text
      }
    }
    text += "\n"
  }
  return text
}

function extractSymbol(lines: string[], lineIdx: number, lang: "py" | "ts"): string {
  for (let i = lineIdx; i >= 0; i--) {
    const line = lines[i]
    if (lang === "py") {
      const match = /^(?:\s*)(?:def|class)\s+([A-Za-z_]\w*)/.exec(line)
      if (match?.[1]) return match[1]
    } else {
      const match =
        /(?:export\s+default\s+)?(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_]\w*)/.exec(line) ??
        /(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?function\b/.exec(line) ??
        /(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>/.exec(line) ??
        /class\s+([A-Za-z_]\w*)/.exec(line) ??
        /([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/.exec(line)
      if (match?.[1]) return match[1]
    }
  }
  return ""
}

function collectExceptBlocks(lines: string[]): ExceptBlock[] {
  const blocks: ExceptBlock[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)except\b[^:]*:\s*(#.*)?$/.exec(lines[i])
    if (!match) continue
    const indent = match[1].length
    let bodyEnd = lines.length
    for (let j = i + 1; j < lines.length; j++) {
      const raw = lines[j]
      const trimmed = raw.trim()
      if (trimmed === "" || trimmed.startsWith("#")) continue
      const lead = raw.length - raw.trimStart().length
      if (lead <= indent) {
        bodyEnd = j
        break
      }
    }
    blocks.push({ headerLine: i, bodyStart: i + 1, bodyEnd, indent })
  }
  return blocks
}

function bodyAfterColon(header: string): string {
  const colon = header.lastIndexOf(":")
  if (colon === -1) return ""
  return header.slice(colon + 1).replace(/#.*$/, "").trim()
}

function isSilentExcept(block: ExceptBlock, lines: string[]): boolean {
  const header = lines[block.headerLine]
  if (/^\s*except\s*:\s*(#.*)?$/.test(header)) return true
  const after = bodyAfterColon(header)
  if (after === "pass") return true
  if (after === "") {
    const body = meaningful(lines, block.bodyStart, block.bodyEnd)
    if (body.length === 1 && body[0].trim() === "pass") return true
  }
  return false
}

function isLogThenDefault(block: ExceptBlock, lines: string[]): boolean {
  const after = bodyAfterColon(lines[block.headerLine])
  const body = meaningful(lines, block.bodyStart, block.bodyEnd)
  const joined = (after ? [after, ...body] : body).join("\n")
  const hasLog =
    /\b(?:logger|logging)\.(?:warning|warn|error|exception|critical|info|debug)\s*\(/.test(joined) ||
    /\bprint\s*\(/.test(joined)
  const hasDefault =
    /(?:^|\n)\s*return\s+(?:None|\[\s*\]|\{\s*\}|\(\s*\)|0(?:\.0)?|False|""|'')\s*(?:#.*)?$/m.test(joined) ||
    /(?:^|\n)\s*return\s*(?:#.*)?$/m.test(joined) ||
    /=\s*(?:None|\[\s*\]|\{\s*\}|\(\s*\)|0(?:\.0)?|False|""|'')\s*(?:#.*)?$/m.test(joined)
  return hasLog && hasDefault
}

function scanGather(lines: string[], file: string): SilentFailureFinding[] {
  const out: SilentFailureFinding[] = []
  const assignments: GatherAssignment[] = []
  for (let i = 0; i < lines.length; i++) {
    const marker = "gather("
    const idx = lines[i].indexOf(marker)
    if (idx === -1) continue
    const parenIndex = idx + marker.length - 1
    const callText = accumulateBalanced(lines, i, parenIndex, "(", ")")
    const returnExceptions = /return_exceptions\s*=\s*True/.test(callText)
    if (!returnExceptions)
      out.push(finding("SF003", file, i + 1, lines[i], extractSymbol(lines, i, "py")))
    const assign = /^\s*(\w+)\s*=\s*await\s+(?:asyncio\.)?gather\s*\(/.exec(lines[i])
    if (assign) assignments.push({ variable: assign[1], line: i, returnExceptions })
  }

  const hasIsinstance = /isinstance\s*\(/.test(lines.join("\n"))
  for (const item of assignments) {
    if (!item.returnExceptions || hasIsinstance) continue
    const indexRe = new RegExp(`\\b${item.variable}\\s*\\[`)
    for (let j = item.line + 1; j < lines.length; j++) {
      if (indexRe.test(lines[j])) {
        out.push(finding("SF004", file, j + 1, lines[j], extractSymbol(lines, j, "py")))
        break
      }
    }
  }
  return out
}

function scanPython(text: string, file: string): SilentFailureFinding[] {
  const lines = text.split("\n")
  const out: SilentFailureFinding[] = []
  for (const block of collectExceptBlocks(lines)) {
    if (isSilentExcept(block, lines)) {
      out.push(finding("SF001", file, block.headerLine + 1, lines[block.headerLine], extractSymbol(lines, block.headerLine, "py")))
      continue
    }
    if (isLogThenDefault(block, lines)) {
      out.push(finding("SF002", file, block.headerLine + 1, lines[block.headerLine], extractSymbol(lines, block.headerLine, "py")))
    }
  }
  out.push(...scanGather(lines, file))
  for (let i = 0; i < lines.length; i++) {
    if (/createEmpty\s*[:=]\s*true/i.test(lines[i]))
      out.push(finding("SF005", file, i + 1, lines[i], extractSymbol(lines, i, "py")))
  }
  return out
}

function scanTypeScript(text: string, file: string): SilentFailureFinding[] {
  const lines = text.split("\n")
  const out: SilentFailureFinding[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = /\bcatch\s*(?:\([^)]*\))?\s*\{/.exec(lines[i])
    if (!match) continue
    const braceIndex = lines[i].indexOf("{", match.index)
    const block = accumulateBalanced(lines, i, braceIndex, "{", "}")
    const inner = block.length >= 2 ? block.slice(1, block.length - 1) : ""
    if (inner.trim() === "") {
      out.push(finding("SF001", file, i + 1, lines[i], extractSymbol(lines, i, "ts")))
      continue
    }
    const hasLog = /\bconsole\.(?:warn|error|log)\s*\(/.test(inner)
    const hasDefault = /\breturn\s+(?:null|undefined|\[\s*\]|\{\s*\}|0|false)\b/.test(inner)
    if (hasLog && hasDefault) out.push(finding("SF002", file, i + 1, lines[i], extractSymbol(lines, i, "ts")))
  }
  for (let i = 0; i < lines.length; i++) {
    if (/createEmpty\s*[:=]\s*true/i.test(lines[i]))
      out.push(finding("SF005", file, i + 1, lines[i], extractSymbol(lines, i, "ts")))
  }
  return out
}

interface LoadedWaivers {
  entries: SilentFailureWaiver[]
  warnings: SilentFailureWaiverWarning[]
  resolved?: string
}

function isCommittedWaiverPath(base: string, abs: string): boolean {
  const rel = relative(resolve(base), resolve(abs))
  if (rel === ".." || rel.startsWith(`..${sep}`)) return false
  const segments = rel.split(sep)
  if (segments[0] === ".matrixx") return false
  if (segments.some((s) => IGNORED_DIRS.has(s))) return false
  return true
}

function isValidWaiverEntry(entry: unknown): entry is SilentFailureWaiver {
  if (typeof entry !== "object" || entry === null) return false
  const e = entry as Record<string, unknown>
  return (
    typeof e.rule === "string" &&
    e.rule in RULE_CATALOG &&
    typeof e.file === "string" &&
    e.file.trim() !== "" &&
    typeof e.symbol === "string" &&
    typeof e.reason === "string" &&
    e.reason.trim() !== "" &&
    typeof e.reviewedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.reviewedAt)
  )
}

function loadWaivers(base: string, waiversParam?: string): LoadedWaivers {
  if (waiversParam === undefined || waiversParam.trim() === "") return { entries: [], warnings: [] }
  const abs = waiversParam.startsWith("/") ? waiversParam : resolve(base, waiversParam)
  const refused = (message: string): LoadedWaivers => ({
    entries: [],
    warnings: [{ kind: "load-warning", message }],
    resolved: abs,
  })
  if (!isCommittedWaiverPath(base, abs))
    return refused(`waiver file refused (must be committed, never under .matrixx/): ${waiversParam}`)
  let raw: string
  try {
    raw = readFileSync(abs, "utf8")
  } catch {
    return refused(`waiver file not readable: ${waiversParam}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return refused(`waiver file is not valid JSON: ${waiversParam}`)
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { waivers?: unknown }).waivers
  if (!Array.isArray(list))
    return refused(`waiver file must be {version:1,waivers:[...]} or a bare array: ${waiversParam}`)
  const entries: SilentFailureWaiver[] = []
  const warnings: SilentFailureWaiverWarning[] = []
  for (let index = 0; index < list.length; index++) {
    const entry = list[index]
    if (isValidWaiverEntry(entry)) entries.push(entry)
    else warnings.push({ kind: "invalid-entry", message: `waiver entry ${index} invalid, skipped`, entry })
  }
  return { entries, warnings, resolved: abs }
}

function waiverKey(rule: string, file: string, symbol: string): string {
  return `${rule}${file}${symbol}`
}

export function scanPath(opts: {
  base: string
  target: string
  globs?: string[]
  threshold?: ScanSeverity
  waivers?: string
}): SilentFailureScanResult {
  const globs = opts.globs && opts.globs.length > 0 ? opts.globs : DEFAULT_GLOBS
  const threshold = opts.threshold ?? "warn"
  const files = collectFiles(opts.target, globs)
  const findings: SilentFailureFinding[] = []
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }
    const rel = displayPath(opts.base, file)
    if (/\.py$/i.test(file)) findings.push(...scanPython(text, rel))
    else if (/\.(?:ts|tsx|js|jsx|mts|cts)$/i.test(file)) findings.push(...scanTypeScript(text, rel))
  }

  const minRank = SEVERITY_RANK[threshold]
  const filtered = findings.filter((f) => SEVERITY_RANK[f.severity] >= minRank)

  const waiverLoad = loadWaivers(opts.base, opts.waivers)
  const waiverKeys = new Set(waiverLoad.entries.map((e) => waiverKey(e.rule, e.file, e.symbol)))
  const active: SilentFailureFinding[] = []
  const waived: SilentFailureFinding[] = []
  for (const item of filtered) {
    if (waiverKeys.has(waiverKey(item.rule, item.file, item.symbol))) waived.push(item)
    else active.push(item)
  }
  const staleWaivers = waiverLoad.entries.filter(
    (e) => !filtered.some((f) => f.rule === e.rule && f.file === e.file && f.symbol === e.symbol),
  )

  let errors = 0
  let warnings = 0
  const byRule: Record<string, number> = {}
  for (const item of active) {
    if (item.severity === "error") errors += 1
    else warnings += 1
    byRule[item.rule] = (byRule[item.rule] ?? 0) + 1
  }
  const waivedByRule: Record<string, number> = {}
  for (const item of waived) {
    waivedByRule[item.rule] = (waivedByRule[item.rule] ?? 0) + 1
  }
  const status: 0 | 1 | 2 = errors > 0 ? 2 : warnings > 0 ? 1 : staleWaivers.length > 0 ? 1 : 0

  return {
    status,
    findings: active,
    waived,
    summary: {
      filesScanned: files.length,
      total: active.length,
      errors,
      warnings,
      byRule,
      waived: waived.length,
      waivedByRule,
      stale: staleWaivers.length,
    },
    waiverFile: waiverLoad.resolved,
    staleWaivers,
    waiverWarnings: waiverLoad.warnings,
  }
}
