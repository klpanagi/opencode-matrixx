import type { BuiltinSkill } from "../types"

const REMOVE_AI_SLOPS_SKILL_NAME = "remove-ai-slops"

const REMOVE_AI_SLOPS_SKILL_DESCRIPTION =
  "Use when cleaning up AI-generated code, removing verbose comments, or fixing redundant error handling — detects and removes 7 categories of AI code smells (verbose comments, redundant error handling, over-engineering, generic phrasing, boilerplate, padding, codegen artifacts) with hybrid scan-then-fix mode. Related: review-work, quality-gate."

export const removeAiSlopsSkill: BuiltinSkill = {
  name: REMOVE_AI_SLOPS_SKILL_NAME,
  description: REMOVE_AI_SLOPS_SKILL_DESCRIPTION,
  allowedTools: [
    "read",
    "write",
    "edit",
    "grep",
    "glob",
    "ast_grep_search",
    "ast_grep_replace",
    "lsp_diagnostics",
    "lsp_find_references",
  ],
  template: `# Remove AI Slops — Code Smell Detector & Fixer

Detect and fix AI-generated code smells across 7 categories. Operates in **hybrid mode**: scan first to identify issues, then guide you through fixes one finding at a time.

## Phase 0: Scope & Setup

Determine scope:
- If no files specified, scan recently changed files (\`git diff --name-only HEAD~1\`)
- If a file/dir is specified, scan those
- If \`--all\` flag, scan entire \`src/\` directory

Create \`.matrixx/slop-scan-<timestamp>.md\` for tracking findings.

## Phase 1: Scan for Slop

Run all 7 category detectors. For each category, output findings grouped by file with line ranges.

---

### Category 1: Verbose Comments

**Detect**: AST patterns and regex for comments that restate the obvious.

**Patterns to flag:**
- \`// This function does X by doing Y\` — describes implementation, not intent
- \`// Loop through each item\` — obvious from the \`for\` loop itself
- \`// Initialize variable\` — obvious from \`const x =\`
- \`// Return result\` — obvious from \`return\`
- \`// Call the API\` — obvious from the function call on the next line
- \`// Check if condition is true\` — obvious from \`if\`
- Block comments that just repeat what the function signature says

**Detection:**
- Use \`ast_grep_search\` with patterns like:
  - \`// $COMMENT\` where $COMMENT matches obvious patterns
  - Function-level JSDoc that adds no info beyond the signature
- Use \`grep\` with regex for known AI comment phrases

**Severity**: LOW (cosmetic, but clutters code)

---

### Category 2: Redundant Error Handling

**Detect**: Error handling patterns that add no value.

**Patterns to flag:**
- Empty catch blocks: \`catch (e) {}\`
- Catch-and-rethrow: \`catch(e) { console.error(e); throw e; }\` (re-throw with no added value)
- Redundant null checks on already-guarded paths
- \`try/catch\` that wraps every single function call individually
- \`catch (error: any)\` (TypeScript — \`unknown\` preferred)

**Detection:**
- Use \`ast_grep_search\` for \`catch($$$) { $$$ }\` and analyze body
- \`ast_grep_search\` for \`if ($VAR != null)\` patterns on already-checked variables
- Use \`lsp_find_references\` to check if null checks are redundant

**Severity**: MEDIUM (adds noise, but doesn't break things)

---

### Category 3: Over-Engineered Patterns

**Detect**: Unnecessary abstraction layers and overly complex patterns.

**Patterns to flag:**
- Abstract factory factory or other nested indirection
- AbstractSingletonProxyBean-style pattern names
- Single-implementation interfaces (unless part of a public API contract)
- Builder pattern for objects with 1-3 simple properties
- Strategy pattern with a single strategy
- Decorator patterns around every function
- Excessive generic constraints (\`<T extends X extends Y extends Z>\`)

**Detection:**
- Use \`lsp_find_references\` to check if interfaces have exactly 1 implementation
- \`ast_grep_search\` for class names containing "Abstract", "Factory", "Builder", "Manager"
- \`grep\` for pattern names like \`*Abstract*\`, \`*Factory*\`, \`*Proxy*\`, \`*Singleton*\`
- Check for builder functions/classes with very few properties

**Severity**: HIGH (indicates misunderstanding of the codebase)

---

### Category 4: Generic AI Phrasing

**Detect**: Code comments and documentation with AI-typical phrasing.

**Phrases to flag (regex case-insensitive):**
- "It's worth noting that"
- "It is important to note"
- "It is important to mention"
- "Let's step through this"
- "In conclusion"
- "As previously mentioned"
- "It should be noted that"
- "It's crucial to understand"
- "Let's break this down"
- "The beauty of this approach"
- "This is a classic example of"
- "Essentially, what this does is"
- "In the world of"
- "When it comes to"
- "One might argue that"
- "It goes without saying"

**Detection:**
- Use \`grep -i\` with regex patterns for each phrase in \`*.ts\` and \`*.md\` files
- Focus comments, docstrings, and inline documentation

**Severity**: LOW (cosmetic, but unprofessional)

---

### Category 5: Cargo-Cult Boilerplate

**Detect**: Patterns copied without understanding.

**Patterns to flag:**
- Excessive defensive programming (checking the same condition at multiple levels)
- \`try/catch\` with \`console.error\` and rethrow in every function
- Identical error handling block copy-pasted across multiple functions
- Redundant type guards on already-typed parameters
- \`if (process.env.NODE_ENV !== 'production')\` debug logging patterns
- \`// TODO: implement\` stubs in production code
- Mock implementations that replicate the real implementation exactly

**Detection:**
- Use \`grep\` to find repeated identical code blocks across files
- \`ast_grep_search\` for try/catch patterns in every function of a file
- \`grep\` for TODO/FIXME/HACK comments in non-test files
- Check for \`console.log\` statements in production code

**Severity**: MEDIUM (code bloat, maintenance burden)

---

### Category 6: Padding/Verbosity

**Detect**: Unnecessary code that adds no information.

**Patterns to flag:**
- Empty \`@returns\` tags in JSDoc
- \`@param {string} name - The name\` — repeats the obvious
- Redundant type annotations: \`const x: string = "hello"\` (type is obvious)
- Unnecessary intermediate variables: \`const result = doSomething(); return result;\` when \`return doSomething()\` works
- \`const x = y as SomeType\` when y is already SomeType
- \`() => { return x }\` when \`() => x\` works
- Destructuring with unused variables
- \`export default\` for a single export (prefer named)
- Variables assigned but never read

**Detection:**
- Use \`ast_grep_search\` for \`const $VAR = $EXPR as $TYPE\` where $VAR is typed
- \`ast_grep_search\` for \`() => { return { $$$ } }\`
- \`grep\` for \`@returns\` without description in JSDoc
- \`lsp_diagnostics\` will catch unused variables

**Severity**: LOW (cosmetic, minor bloat)

---

### Category 7: Weird Codegen Artifacts

**Detect**: Inconsistencies that suggest AI-generated code was inserted without review.

**Patterns to flag:**
- Mix of import styles in the same file (CommonJS + ESM, default + named)
- Inconsistent error handling within the same file (some async/await, some .then())
- Mixed indentation or naming conventions in the same file
- Unused imports (LSP will catch these)
- \`import * as\` that imports everything but only uses one thing
- Code that doesn't follow the file's established patterns
- Types/interfaces defined inline instead of in a shared types file
- Magic numbers and strings that should be constants
- Language-mismatched conventions (e.g., Java-style getters/setters in TypeScript)

**Detection:**
- Use \`grep\` for mixed module systems in the same file
- \`lsp_diagnostics\` for unused imports
- \`ast_grep_search\` for inline type definitions that should be shared
- Manual review of file-level pattern consistency

**Severity**: MEDIUM-HIGH (indicates un-reviewed code)

---

## Phase 2: Report Findings

After scanning all categories, present a structured report:

\`\`\`markdown
# AI Slop Scan Results

Scanned: <files/dirs>
Total findings: <count>

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| 1. Verbose Comments | N | - | - | - | N |
| 2. Redundant Error Handling | N | - | N | N | - |
| ... | ... | ... | ... | ... | ... |

## Findings by File

### <file-path.ts>

#### [HIGH] Category 3: Over-Engineered — AbstractUserFactoryManager
- **Location**: line 42-89
- **Current**: \`class AbstractUserFactoryManager<T extends ...>\`
- **Suggestion**: Replace with simple function \`createUser()\`
- **Severity**: HIGH
- **Status**: PENDING

#### [MED] Category 2: Redundant Error Handling
- **Location**: line 15-18
- **Current**: 
\`\`\`typescript
try {
  await doSomething()
} catch (e) {
  console.error(e)
  throw e
}
\`\`\`
- **Suggestion**: Remove try/catch — caller handles errors. Or add meaningful error context.
- **Severity**: MEDIUM
- **Status**: PENDING

... (repeat for all findings)
\`\`\`

## Phase 3: Guided Fix

For each finding, present the user with options:

1. **Apply fix** — Show the proposed change as a diff, ask for confirmation
2. **Skip** — Mark as reviewed and acceptable
3. **Snooze** — Skip for now but flag for later review
4. **Adjust** — User provides alternative fix

Apply fixes using the \`edit\` tool only after user confirmation.

**Fix application pattern:**
1. Present the proposed replacement code
2. Wait for user response (\`y\`/\`n\`/\`skip\`/\`adjust\`)
3. On approval: \`edit\` the file
4. Run \`lsp_diagnostics\` on the file to verify no new errors
5. Mark finding as FIXED / SKIPPED

**Batch support**: User can say "apply all LOW" or "apply all for file X" to batch-approve.

## Phase 4: Verify

After all fixes applied:
1. \`bun run typecheck\` — no new type errors
2. \`bun run lint\` — no new lint errors
3. Verify no changes broke tests for affected files

Write final summary to \`.matrixx/slop-scan-<timestamp>.md\`.

## Rules

- NEVER auto-apply fixes without user approval
- ALWAYS show the proposed change before applying
- ALWAYS run \`lsp_diagnostics\` after each edit
- Scan ALL 7 categories every time — don't skip categories
- Flag findings only once (deduplicate across rounds)
- For \`--all\` mode, process files in batches of 5 to avoid overload
- If a pattern is clearly intentional (pre-existing convention), skip it`,
}
