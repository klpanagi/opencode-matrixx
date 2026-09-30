import { GATE_HEURISTIC_WARNING, UNAVAILABLE_EVIDENCE_GAP } from "../../completion-review/admission-gate"

export const PLAN_REVIEW_TEMPLATE = `You are running a post-execution completion review of a finished plan.

## Triggering — LOCKED

This command is the ONLY trigger for a completion review. There is no other one:
no hook invokes it, no \`session.idle\` path invokes it, no \`progress.isComplete\`
path invokes it, and no Architect step invokes it. A hook cannot run an agent,
so with explicit-only triggering there is deliberately NO automatic attach point.
That is the design, not a gap. Never install one, and never offer to.

## WHAT TO DO, IN THIS ORDER

1. **Resolve the plan, or stop.** Take the plan name from \`<user-request>\`. Call
   \`plan_list\`, then \`plan_tasks\` for the named plan. \`plan_list\` SILENTLY SKIPS
   non-kebab filenames, so a non-kebab plan name yields an EMPTY resolution
   rather than an error. If the requested plan is absent from the result, ERROR
   CLEARLY AND STOP: name the plan, state that \`plan_list\` returned no match, and
   create no report file. Never proceed on an empty or partial resolution, and
   never substitute a different plan.

2. **Gather the deterministic inputs.** Read the plan with \`plan_read\` and call
   \`gatherCompletionReviewInputs({ directory, planPath })\`. This is pure: no
   model, no network, no mutation. DoD is NEVER merged into \`isComplete\`, and
   task→plan linkage is a convention, not a foreign key — both are labelled
   \`heuristic\` for that reason.

3. **Evaluate the admission gate BEFORE anything else.** Read
   \`evaluateAdmission({ progress, admission })\` from the gathered facts. It reads
   T2's output and re-reads nothing.

4. **Delegate the MODEL dimensions to the \`auditor\` agent.** Pass it the
   gathered context and the report skeleton. It supplies dimensions 2, 3, 4, 6
   and 8. It must never write the report into the plan file.

5. **Compute the DETERMINISTIC dimensions.** Call \`evaluateReview\` with
   \`missingModelSections\` supplied as INPUT:
   \`detectMissingModelSections(buildSectionIndex(planContent))\`. Do not let the
   evaluator re-parse. Dimensions 1, 5 and 7 are code-computed. Pass each
   dimension's \`reason\` through as \`rationale\`; do not invent your own wording.

6. **Render and write the report.** Run \`buildReviewDirCommand()\` in bash first
   (\`mkdir -p ".matrixx/reviews"\`), then call \`writeReviewReport(input)\`. It
   writes \`.matrixx/reviews/<plan>.md\` and the \`.json\` sidecar together, and
   never opens the plan file. \`generatedAt\` is a caller-supplied input.

7. **Report the path back to the user.** Give the absolute report path and the
   sidecar path. Do not modify the plan.

## THE ADMISSION GATE — never on \`isComplete\` alone

\`isComplete\` derives solely from the plan's own checkboxes, and those checkboxes
are flipped by the very fuzzy text-similarity heuristic the gatherer refuses to
trust. Admitting on \`isComplete\` alone would decide admission on the exact
artifact the report then labels untrustworthy. Admission therefore requires BOTH:

- **a.** \`isComplete === true\` AND \`needsTriage === false\`
  (\`needsTriage\` is checked FIRST, because a zero-checkbox plan arrives with
  \`isComplete: true\` by vacuity), **and**
- **b.** at least one INDEPENDENT corroborating terminal signal — a linked task
  in terminal status or a notepad \`## Completion\` stamp — whose records account
  for the plan's declared work.

${GATE_HEURISTIC_WARNING}

### Three states

- **\`agree\`** — \`isComplete === true && !needsTriage && corroboration present &&
  corroboration accounts for the plan\`. The report records which signal admitted
  the plan.
- **\`disagree\`** — the signals conflict. **PROCEED and record \`gateDisagreement\`**
  as \`{ checkboxesSaysComplete, corroborationSaysComplete, resolved: "proceed",
  reason }\`, naming BOTH signals. Never silently pick a winner. Hard refusal is
  reserved for exactly two cases: vacuous completeness (\`needsTriage: true\`) or
  both signals saying incomplete.
- **\`unavailable\`** — corroboration is structurally absent (0 linked tasks AND
  0 stamps). Admit on \`isComplete\` + \`needsTriage === false\`, record
  \`gateEvidence: "unavailable"\` and the one-line reason below. You
  MUST NOT emit a \`gateDisagreement\` here — every legacy plan would then look
  like a disagreement and the field would be noise.
  Reason to record: ${UNAVAILABLE_EVIDENCE_GAP}.
  \`gateDisagreement\` is real but diagnostic-only: no code reads it; the renderer
  shows it to the human reader.

## THE FOUR REQUIRED PARTS

The report must carry all four, each under its own heading, and none is skipped
when its data is absent:

- **Summary**
- **Score**
- **Complexity**
- **Required Effort**

## CRITICAL

- Never write the report into the plan file. The plan records intent and progress;
  prose corrupts both, and a report appended there makes the progress counters
  absorb paragraphs they were never meant to count.
- A low score is ADVISORY. Nothing in this pipeline halts, retries or rejects a
  plan because of the number, and \`unscorable\` is never rendered as 0 — a
  not-scored plan emits no number at all.
- On an unfinished plan, create NO report file and invoke NO agent. Say the plan
  is not scorable yet.
`
