import type { ScanSeverity } from "./types"

export const SILENT_FAILURE_SCAN_DESCRIPTION = `Scan Python and TypeScript/JavaScript source for silent-failure anti-patterns — code paths that turn a real error into a plausible-looking normal result. Read-only and deterministic; returns a JSON report with a status exit code (0=clean, 1=warnings, 2=errors).

Rules:
- SF001 bare \`except:\` or an \`except\` whose body is only \`pass\` (also empty TS \`catch {}\`).
- SF002 an \`except\`/catch that logs a warning and then returns a default value indistinguishable from a real outcome.
- SF003 \`asyncio.gather(...)\` without \`return_exceptions=True\`.
- SF004 results from \`gather(return_exceptions=True)\` indexed without per-result \`isinstance\` inspection.
- SF005 gap-masking flags such as \`createEmpty: true\`.

Detection is line-oriented with bounded block tracking (documented fallback); no AST dependency. Use \`severity\` to filter the report to a minimum severity ("warn" reports warnings and errors; "error" reports errors only).

Waivers: pass \`waivers\` (project-relative or absolute path to a COMMITTED waiver JSON file — never under gitignored \`.matrixx/\`) shaped \`{version:1,waivers:[{rule,file,symbol,reason,reviewedAt,owner?}]}\`. The match key is rule+file+enclosing-symbol (never line numbers); matched findings are excluded from the status but reported in \`waived\`. Entries matching nothing appear in \`staleWaivers\` and force status to at least 1.`

export const DEFAULT_GLOBS = ["**/*.py", "**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]

export const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__"])

export const RULE_CATALOG: Record<string, { severity: ScanSeverity; why: string; fix: string }> = {
  SF001: {
    severity: "error",
    why: "A bare except (or an except/catch whose entire body is `pass`) swallows every error, so a real failure becomes indistinguishable from normal control flow.",
    fix: "Catch a specific exception and re-raise, log with context, or return an explicit error value. Never leave an exception handler empty.",
  },
  SF002: {
    severity: "warn",
    why: "Logging a warning and then returning a default value makes a failure look like a legitimate empty/zero result to every caller.",
    fix: "Return an explicit error sentinel or Result type (or re-raise). If a default is truly intended, make it distinguishable from a real outcome.",
  },
  SF003: {
    severity: "warn",
    why: "asyncio.gather without return_exceptions=True aborts on the first failure, hiding partial results and making batch outcomes non-deterministic.",
    fix: "Pass return_exceptions=True and inspect each result for an Exception before using it.",
  },
  SF004: {
    severity: "error",
    why: "Results from gather(return_exceptions=True) are indexed without checking for Exception, so a failed task's Exception object is treated as data — a plausible-looking wrong answer.",
    fix: "Inspect each element with isinstance(r, Exception) (or a Result type) before using it.",
  },
  SF005: {
    severity: "warn",
    why: "Gap-masking flags such as createEmpty: true fabricate empty series for missing data, so 'no data' and 'not observed' become indistinguishable downstream.",
    fix: "Do not synthesize empty results; surface the gap explicitly (null/missing) and let the caller decide how to handle it.",
  },
}

export const SEVERITY_RANK: Record<ScanSeverity, number> = { warn: 1, error: 2 }
