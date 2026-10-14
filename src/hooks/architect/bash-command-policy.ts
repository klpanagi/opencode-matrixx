// Bash command policy (pure classifier, no I/O / no throw).
// ALLOW (read-only + verification): pytest, mypy, ruff, tsc, `bun test`,
//   `bun run typecheck`, `bun run build`, git status/diff/log, ls, cat,
//   mkdir -p ONLY when every non-flag path arg contains `.matrixx/`
//   (consistent with system-reminder-templates ALLOWED ops: files inside
//   `.matrixx/`, reading files for verification, running diagnostics/tests).
// DENY (mutations): rm, git checkout --, git reset, git clean, mv, cp,
//   sed -i/--in-place, tee, chmod, chown, python -c, any `>` redirect
//   outside quotes, mkdir outside `.matrixx/`.
// Key decisions: deny-wins across &&/||/`;`/`|`/`&`/newline/`$()` segments;
//   quote-aware redirect check (strip inner quotes first, so `echo "a > b"`
//   stays neutral but `cat f > g` denies; whole-segment-quoted `"echo > f"`
//   denies by design after outer-quote peel); git add/commit -> neutral
//   (staging/commit decisions belong to the caller).
// Follow-ups (comment only, do NOT change behavior here): isMatrixPath looks
//   over-permissive and isCallerOrchestrator fails open — review separately in
//   matrix-path.ts / session-utils.ts.

export type BashVerdict = "allow" | "deny" | "neutral"

// Deny rules in task-edit-guard BLOCKED_PATTERNS style: one RegExp + comment per rule.
const DENY_PATTERNS: RegExp[] = [
  /\brm\b/i, // rm — destructive file removal
  /\bgit\s+checkout\s+--/i, // git checkout -- — restores/discards working-tree changes
  /\bgit\s+reset\b/i, // git reset — rewrites index/history
  /\bgit\s+clean\b/i, // git clean — deletes untracked files
  /\bmv\b/i, // mv — moves/renames files
  /\bcp\b/i, // cp — copies files
  /\bsed\b.*(?:\s-i\b|\s--in-place\b)/i, // sed -i / sed --in-place — in-place file edits
  /\btee\b/i, // tee — writes stdin to files
  /\bchmod\b/i, // chmod — permission mutation
  /\bchown\b/i, // chown — ownership mutation
  /\bpython3?\s+-c\b/i, // python -c / python3 -c — inline script file hacks
]

// Allow rules: case-insensitive prefix/verb match on the unwrapped segment.
const ALLOW_PATTERNS: RegExp[] = [
  /^\s*pytest\b/i, // pytest — test runner
  /^\s*mypy\b/i, // mypy — type checking
  /^\s*ruff\b/i, // ruff — linting
  /^\s*tsc\b/i, // tsc — TypeScript compiler
  /^\s*bun\s+test\b/i, // bun test — test runner
  /^\s*bun\s+run\s+typecheck\b/i, // bun run typecheck — verification
  /^\s*bun\s+run\s+build\b/i, // bun run build — verification build
  /^\s*git\s+status\b/i, // git status — read-only
  /^\s*git\s+diff\b/i, // git diff — read-only
  /^\s*git\s+log\b/i, // git log — read-only
  /^\s*ls\b/i, // ls — read-only listing
  /^\s*cat\b/i, // cat — read-only file view
]

const WRAPPER_PATTERN = /^(?:rtk|bash\s+-c|sh\s+-c)\b\s*/i

function stripOuterQuotes(s: string): string {
  const t = s.trim()
  if (t.length >= 2) {
    const first = t[0]
    const last = t[t.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1).trim()
    }
  }
  return t
}

function stripQuotes(s: string): string {
  return s.replace(/"[^"]*"|'[^']*'/g, "")
}

function hasRedirectOutsideQuotes(segment: string): boolean {
  return stripQuotes(segment).includes(">")
}

function classifySegment(segment: string): BashVerdict {
  const unwrapped = unwrapWrapper(segment)

  // mkdir -p grey zone: allow only if every path arg contains .matrixx/
  if (/^\s*mkdir\b/i.test(unwrapped)) {
    const args = stripQuotes(unwrapped)
      .replace(/^\s*mkdir\s*/i, "")
      .split(/\s+/)
      .filter((a) => a.length > 0 && !a.startsWith("-"))
    if (args.length > 0 && args.every((a) => a.includes(".matrixx/"))) {
      return "allow"
    }
    return "deny"
  }

  // Neutral grey zone: staging/commit decisions belong to the caller.
  if (/^\s*git\s+(add|commit)\b/i.test(unwrapped)) {
    return "neutral"
  }

  // Redirect outside quotes denies (checked before allow so `cat f > g` denies).
  if (hasRedirectOutsideQuotes(unwrapped)) {
    return "deny"
  }

  if (DENY_PATTERNS.some((rx) => rx.test(unwrapped))) {
    return "deny"
  }
  if (ALLOW_PATTERNS.some((rx) => rx.test(unwrapped))) {
    return "allow"
  }
  return "neutral"
}

export function unwrapWrapper(segment: string): string {
  let current = segment.trim()
  for (;;) {
    const stripped = stripOuterQuotes(current)
    // Strip one layer of surrounding quotes when they wrap the whole segment.
    if (stripped !== current) {
      current = stripped
      continue
    }
    const match = WRAPPER_PATTERN.exec(current)
    if (!match) {
      return current
    }
    current = current.slice(match[0].length).trim()
  }
}

export function splitCommands(command: string): string[] {
  const parts: string[] = []
  let current = ""
  let quote: string | null = null
  const push = (): void => {
    const trimmed = current.trim()
    if (trimmed.length > 0) {
      parts.push(trimmed)
    }
    current = ""
  }
  let i = 0
  while (i < command.length) {
    const ch = command[i]
    if (quote !== null) {
      current += ch
      if (ch === quote) {
        quote = null
      }
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      i += 1
      continue
    }
    // $() subshell boundary acts as a separator.
    if (ch === "$" && command[i + 1] === "(") {
      push()
      i += 2
      continue
    }
    if (ch === ")" || ch === "\n") {
      push()
      i += 1
      continue
    }
    if (ch === "&" && command[i + 1] === "&") {
      push()
      i += 2
      continue
    }
    if (ch === "|" && command[i + 1] === "|") {
      push()
      i += 2
      continue
    }
    if (ch === ";" || ch === "|" || ch === "&") {
      push()
      i += 1
      continue
    }
    current += ch
    i += 1
  }
  push()
  return parts
}

export function classifyBashCommand(command: string): BashVerdict {
  const segments = splitCommands(command)
  if (segments.length === 0) {
    return "neutral"
  }
  const verdicts = segments.map(classifySegment)
  if (verdicts.some((v) => v === "deny")) {
    return "deny"
  }
  if (verdicts.every((v) => v === "allow")) {
    return "allow"
  }
  return "neutral"
}
