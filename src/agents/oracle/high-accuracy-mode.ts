/**
 * Oracle High Accuracy Mode
 *
 * Phase 3: Smith review loop for rigorous plan validation.
 */

/**
 * Ceiling on Smith review rounds — BURN CONTROL ONLY.
 *
 * Not the primary stopping rule: the loop normally exits earlier on convergence.
 * Four distinct exits exist, and conflating them is what capped review quality:
 *   OKAY        — plan approved (best case)
 *   CONVERGED   — a round surfaced no NEW issue category (normal exit)
 *   STALL       — identical category set twice: a disagreement, not progress
 *   CEILING     — budget exhausted; report unresolved blockers, never hide them
 */
export const SMITH_MAX_REVIEW_ROUNDS = 8

/** Resolve the effective Smith review ceiling from plugin config. */
export function resolveSmithMaxReviewRounds(config?: {
  plans?: { smith_max_review_rounds?: number }
}): number {
  return config?.plans?.smith_max_review_rounds ?? SMITH_MAX_REVIEW_ROUNDS
}

export function createOracleHighAccuracyMode(
  maxRounds: number = SMITH_MAX_REVIEW_ROUNDS,
): string {
  return `# PHASE 3: PLAN GENERATION

## High Accuracy Mode (If User Requested) - MANDATORY LOOP

**When user requests high accuracy, this is a NON-NEGOTIABLE commitment.**

### The Smith Review Loop (ABSOLUTE REQUIREMENT)

\`\`\`typescript
// After generating the initial plan. Four exits: OKAY, CONVERGED, STALL, CEILING.
let previousCategories: string[] | null = null

for (let round = 1; round <= ${maxRounds}; round++) {
  // Fire Smith in background (never a blocking nested call), then collect its verdict.
  const smithTask = task(
    subagent_type="smith",
    load_skills=[],
    prompt=".matrixx/plans/{name}.md",
    run_in_background=true
  )
  const result = background_output(task_id=smithTask.task_id)

  if (result.verdict === "OKAY") break          // exit 1: approved

  // Classify each of Smith's blocking issues yourself — Smith reports free-text
  // blockers and does NOT tag them. Use exactly these three buckets, which are
  // Smith's own three checks:
  //   "reference"     — a cited file/path is missing, wrong, or irrelevant
  //   "executability" — a task lacks the context or criteria to START work
  //   "blocker"       — a contradiction, or a gap that would fully stop work
  const categories: string[] = classify(result.blockingIssues)   // e.g. ["reference"]

  if (previousCategories && categories.every((c) => previousCategories.includes(c))) {
    // exit 2: CONVERGED — no NEW issue category this round. Another round will not reduce them.
    if (categories.length === previousCategories.length) {
      // exit 3: STALL — identical set twice. You and Smith disagree; that is not progress.
      // STOP looping and ask the user which constraint wins. Do NOT resubmit.
    }
    break
  }

  previousCategories = categories

  if (round === ${maxRounds}) {
    // exit 4: CEILING — no budget left to re-review. Do NOT ship a silently un-reviewed
    // revision: list every unresolved blocker under the plan's "Unresolved Smith Blockers"
    // heading AND name them in your reply to the user.
    break
  }

  // Smith rejected - YOU MUST FIX AND RESUBMIT.
  // Read Smith's feedback carefully. Address EVERY issue raised. Regenerate. Resubmit.
  // NO EXCUSES. NO SHORTCUTS. NO GIVING UP.
}
\`\`\`

### CRITICAL RULES FOR HIGH ACCURACY MODE

1. **NO EXCUSES**: If Smith rejects, you FIX it. Period.
   - "This is good enough" → NOT ACCEPTABLE
   - "The user can figure it out" → NOT ACCEPTABLE
   - "These issues are minor" → NOT ACCEPTABLE

2. **FIX EVERY ISSUE**: Address ALL feedback from Smith, not just some.
   - Smith says 5 issues → Fix all 5
   - Partial fixes → Smith will reject again

3. **STOPPING — four exits, all legitimate**:
   - **OKAY** — approved. Best case.
   - **CONVERGED** — after classifying this round's blockers into Smith's three buckets, no NEW
     bucket appeared versus the previous round. The remaining blockers are not being reduced by
     another round, so shipping now is the correct outcome, not a failure.
   - **STALL** — the identical category set twice in a row means you and Smith disagree, not
     that the plan is improving. Stop and ask the user which constraint wins. Do NOT loop again.
   - **CEILING (${maxRounds} rounds)** — budget exhausted. This is NOT a licence to skip review:
     record every unresolved blocker under the plan's "Unresolved Smith Blockers" heading and
     name them in your reply. Never present an un-reviewed revision as if it had passed.

   Never burn rounds past the ceiling, and never pad a round with cosmetic edits to look productive.

### SIZE GATE (90% of the effective cap)
When the plan file exceeds 90% of the effective cap, YOUR revisions may only remove or defer — never add. Record every deferral in the plan's out-of-scope table. A revision that grows the file past this gate is a failed revision: revert it and trim instead. This is enforced independently of you: \`plan_create\`/\`plan_update\` refuse repeated growing over-cap writes with \`trim_required\`, and only shrinking writes persist.

4. **QUALITY IS NON-NEGOTIABLE**: User asked for high accuracy.
   - They are trusting you to deliver a bulletproof plan
   - Smith is the gatekeeper
   - Your job is to satisfy Smith, not to argue with it

5. **SMITH INVOCATION RULE (CRITICAL)**:
   When invoking Smith, provide ONLY the file path string as the prompt.
   - Do NOT wrap in explanations, markdown, or conversational text.
   - System hooks may append system directives, but that is expected and handled by Smith.
   - Example invocation: \`prompt=".matrixx/plans/{name}.md"\`

### What "OKAY" Means

Smith only says "OKAY" when:
- 100% of file references are verified
- Zero critically failed file verifications
- ≥80% of tasks have clear reference sources
- ≥90% of tasks have concrete acceptance criteria
- Zero tasks require assumptions about business logic
- Clear big picture and workflow understanding
- Zero critical red flags

**Until you see "OKAY" from Smith, the plan is NOT ready.**
`
}

/** Default instance — back-compat for existing importers and tests. */
export const ORACLE_HIGH_ACCURACY_MODE = createOracleHighAccuracyMode()
