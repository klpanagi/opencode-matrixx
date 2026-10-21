export const HUMANIZE_TEMPLATE = `# Humanize Command

## Usage
\`\`\`
/humanize [target] [--mode=text|comments|code|all] [--dry-run]

Arguments:
  target: What to humanize. Can be:
    - File path: src/auth/handler.ts / docs/guide.md
    - Directory: src/features/
    - Glob: src/**/*.ts
    - Inline prose: quoted string "..." (text mode)
    - Omitted: defaults to git-changed files (git diff --name-only HEAD~1), else src/

Options:
  --mode: Pipeline mode (default: all when target is code file/dir; text when target is prose/md or quoted string)
    - text: prose quality only (clarity, concision, natural voice)
    - comments: comment quality only (slop categories 1, 4)
    - code: code quality only (slop categories 2, 3, 5, 6, 7)
    - all: route each finding to its mode and run the full pipeline

  --dry-run: Report findings WITHOUT modifying anything (default: false)
\`\`\`

## What This Command Does

Raises prose, comment, and code quality to a natural human standard through a
guided, approval-gated pipeline. Three modes route findings to the right rules:

1. **text** - Prose quality: clarity, concision, natural voice, structure.
2. **comments** - Comment quality: slop Categories 1 and 4. Rewrite or delete;
   preserve intent-bearing comments (why, not what).
3. **code** - Code quality: slop Categories 2, 3, 5, 6, 7. Simplify without
   behavior change.
4. **all** - Route each finding to its mode and run the full pipeline.

**Quality-focused only. NO-detector-evasion: this command does NOT include,
suggest, or facilitate any detector-bypass techniques or guidance. No
obfuscation tricks, no "beat the detector" heuristics, no paraphrase-to-evade
patterns. Quality improvements only.**

---

# PHASE 0: VALIDATE REQUEST (MANDATORY FIRST STEP)

## Step 0.1: Parse Target and Mode

| Input | Interpretation |
|-------|---------------|
| File path (src/auth/handler.ts, docs/guide.md) | Scan that file only |
| Directory path (src/features/) | Scan all source files in directory |
| Glob pattern (src/**/*.ts) | Scan matching files |
| Quoted string ("...") | Inline prose, text mode |
| No argument | git-changed files (git diff --name-only HEAD~1), else src/ |

Mode routing:
- Target is code file/dir/glob -> default mode: all
- Target is prose/md file or quoted string -> default mode: text
- Explicit --mode always wins over the default

## Step 0.2: Detect --dry-run Flag

If --dry-run is present or user says "just show me" / "report only":
- Set dry-run mode: report findings WITHOUT modifying anything
- Skip PHASE 3 (guided fix) entirely; stop after the Phase 2 report

## Step 0.3: Create Initial Todos

\`\`\`
task_create({ items: [
  {"subject": "PHASE 1: Scan/Detect - run applicable detectors per mode", "priority": "high"},
  {"subject": "PHASE 2: Report - structured findings with severity and status", "priority": "high"},
  {"subject": "PHASE 3: Guided Fix - per-finding approval, never auto-apply", "priority": "high"},
  {"subject": "PHASE 4: Verify - diagnostics, typecheck, lint, tests", "priority": "high"}
]})
\`\`\`

---

# PHASE 1: SCAN/DETECT

**Mark PHASE 1 as in_progress.**

## 1.1: Text Mode — Prose-Quality Rules

For prose files (.md, .txt) and quoted strings, flag:

- **clarity** - one idea per sentence, active voice preference, concrete over abstract
- **concision** - cut filler, no redundant hedges
- **natural voice** - varied sentence length, no formulaic openers/closers; avoid
  formulaic phrasing as a quality matter (never as evasion)
- **structure** - logical flow, scannable headings

## 1.2: Comments Mode — Categories 1 and 4

### Category 1: Verbose Comments (LOW)

Comments restating the obvious; empty JSDoc. Detection: ast_grep_search
(\`// $COMMENT\` where $COMMENT matches obvious patterns), grep for known AI
comment phrases. Flag: \`// Loop through each item\`, \`// Initialize variable\`,
\`// Return result\`, block comments repeating the function signature.

### Category 4: Generic AI Phrasing (LOW)

Code comments and documentation with AI-typical phrasing. Detection: grep -i
case-insensitive for the 17 flagged phrases: "It's worth noting that",
"It is important to note", "It is important to mention",
"Let's step through this", "In conclusion", "As previously mentioned",
"It should be noted that", "It's crucial to understand",
"Let's break this down", "The beauty of this approach",
"This is a classic example of", "Essentially, what this does is",
"In the world of", "When it comes to", "One might argue that",
"It goes without saying".

## 1.3: Code Mode — Categories 2, 3, 5, 6, 7

### Category 2: Redundant Error Handling (MEDIUM)

Empty catch blocks (\`catch (e) {}\`), catch-log-rethrow
(\`catch(e) { console.error(e); throw e; }\`), over-wrapped try/catch,
\`catch (error: any)\` (unknown preferred). Detection: ast_grep_search for
\`catch($$$) { $$$ }\`, lsp_find_references for redundant null checks.

### Category 3: Over-Engineered Patterns (HIGH)

Single-implementation interfaces, builder-for-3-props, single strategy,
Abstract*Factory*Manager naming, deep generics. Detection:
lsp_find_references to check single implementations, ast_grep_search for class
names containing "Abstract", "Factory", "Builder", "Manager", grep for
*Abstract*, *Factory*, *Proxy*, *Singleton* patterns.

### Category 5: Cargo-Cult Boilerplate (MEDIUM)

Copy-pasted error blocks, redundant guards, console.log in prod, TODO stubs.
Detection: grep for repeated identical blocks, ast_grep_search for try/catch
in every function, grep for TODO/FIXME/HACK in non-test files.

### Category 6: Padding/Verbosity (LOW)

Empty @returns tags, obvious @param descriptions, redundant annotations
(\`const x: string = "hello"\`), unnecessary intermediates
(\`const result = doSomething(); return result;\`), unused destructured vars.
Detection: ast_grep_search for redundant casts and arrow wrappers, grep for
empty @returns, lsp_diagnostics for unused variables.

### Category 7: Weird Codegen Artifacts (MEDIUM-HIGH)

Mixed import styles, mixed async styles, unused imports, \`import *\` for one
symbol, inline types belonging in shared files, magic numbers,
language-mismatched conventions. Detection: grep for mixed module systems,
lsp_diagnostics for unused imports, ast_grep_search for inline type
definitions that should be shared.

Batching: for --all or large scopes, process files in groups of 5.
Dedupe findings; group by file with line ranges.

**Mark PHASE 1 as completed.**

---

# PHASE 2: REPORT

**Mark PHASE 2 as in_progress.**

Present a structured report:

\`\`\`
## Humanize Report

### Scan Target: [path]
### Mode: [text|comments|code|all]
### Findings: [N] ([X] text, [Y] comments, [Z] code)

| Category | Count | Severity |
|----------|-------|----------|
| Prose quality | N | LOW |
| 1. Verbose Comments | N | LOW |
| 2. Redundant Error Handling | N | MEDIUM |
| 3. Over-Engineered Patterns | N | HIGH |
| 4. Generic AI Phrasing | N | LOW |
| 5. Cargo-Cult Boilerplate | N | MEDIUM |
| 6. Padding/Verbosity | N | LOW |
| 7. Codegen Artifacts | N | MEDIUM-HIGH |

### Findings by File

#### [SEVERITY] Category N: Title — Location
- **Location**: line X-Y
- **Current**: [original text/code]
- **Suggestion**: [proposed rewrite/simplification]
- **Severity**: [LOW|MEDIUM|HIGH|MEDIUM-HIGH]
- **Status**: PENDING
\`\`\`

If --dry-run mode: present the report and STOP. Do not proceed to Phase 3.

\`\`\`
This was a dry-run analysis. No code was modified.
To apply fixes, run: /humanize [same-target] [--mode=...]
\`\`\`

**Mark PHASE 2 as completed.**

---

# PHASE 3: GUIDED FIX

**Mark PHASE 3 as in_progress.**

For each finding, present the diff and ask the user:

1. **Apply** - apply this fix
2. **Skip** - mark as reviewed and acceptable
3. **Snooze** - skip for now, flag for later review
4. **Adjust** - user provides an alternative fix

Batch support: user can say "apply all LOW" or "apply all for file X" to
batch-approve.

**NEVER auto-apply fixes without user approval.** ALWAYS show the proposed
change before applying. ALWAYS run lsp_diagnostics after each edit. Mark each
finding as FIXED / SKIPPED.

**Mark PHASE 3 as completed.**

---

# PHASE 4: VERIFY

**Mark PHASE 4 as in_progress.**

After all fixes applied:

1. lsp_diagnostics on all changed files - no new errors
2. \`bun run typecheck\` - no new type errors
3. \`bun run lint\` - no new lint errors
4. Run affected tests - no new failures

Generate a summary report (fixed count, skipped count, files modified,
verification results).

**Mark PHASE 4 as completed.**

---

# CRITICAL RULES

## NEVER DO
- Include, suggest, or facilitate any detector-evasion or detector-bypass
  techniques, heuristics, or guidance of any kind
- NEVER auto-apply fixes without explicit user approval per finding or batch
- Skip lsp_diagnostics after an edit
- Proceed with new type errors, new lint errors, or new test failures
- Modify behavior when simplifying code (quality refactors only)
- Use \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\` to suppress fix side effects

## ALWAYS DO
- Parse target, mode, and --dry-run before scanning
- Route each finding to its mode (text/comments/code)
- Show the proposed diff and wait for approval before editing
- Run lsp_diagnostics after each edit
- Verify with typecheck, lint, and affected tests in Phase 4
- Keep todos updated in real-time

## ABORT CONDITIONS
If any of these occur, STOP and consult user:
- Type errors appear after a fix (new, not pre-existing)
- Lint errors appear after a fix (new, not pre-existing)
- Tests fail after a fix (new failures, not pre-existing)
- More than 20 findings in a single file (likely misconfiguration)

<user-request>
$ARGUMENTS
</user-request>
`
