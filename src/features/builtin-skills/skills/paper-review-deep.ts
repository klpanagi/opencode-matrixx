import type { BuiltinSkill } from "../types"

const PAPER_REVIEW_DEEP_SKILL_NAME = "paper-review-deep"

const PAPER_REVIEW_DEEP_SKILL_DESCRIPTION =
  "Use when deep-reviewing papers, running multi-stage manuscript audits, or stress-testing claims with red-team critique — 7-stage staged-context pipeline (intake to synthesis) reusing the paper-review V1 scoring matrix. Related: paper-review, document-reader."

export const paperReviewDeepSkill: BuiltinSkill = {
  name: PAPER_REVIEW_DEEP_SKILL_NAME,
  description: PAPER_REVIEW_DEEP_SKILL_DESCRIPTION,
  allowedTools: ["document-reader"],
  template: `# Paper Review Deep Skill

V2 staged-context pipeline for academic papers. Seven stages run in order,
each receiving ONLY prior stage outputs plus bounded excerpts (≤4000 chars
per stage). Never pass the full PDF to any single stage — fit the content
to budget first (see staged context rule below).

> Scoring reuses the V1 matrix from the \`paper-review\` skill by reference:
> the same 6 criteria (Novelty, Impact, Evaluation, Rigor, Clarity,
> Grounding) with identical weights, and the same evidence-quote schema
> field names (\`overall_score\`, \`evidence\`, \`ethics_gate\`, \`quote\`).
> Do NOT redefine weights or the evidence schema here — call the V1
> scoring contract in the synthesis stage.

## Staged context rule (precedent: fit_to_budget / budget_for_stages)

- Per-stage input budget: prior stage outputs + bounded excerpts of at most
  4000 characters per stage. Truncate with head/tail placement for critical
  content (abstract, claims, methods) following the fit_to_budget precedent.
- Forbid full-PDF-per-stage: no stage receives the entire document text.
- The intake stage records the metadata + budget note (total chars seen,
  excerpt windows kept) so later stages can request a bounded re-excerpt
  instead of the full PDF.

## Stage 1 — intake (metadata + budget note)

Extract: title, authors, venue/year if present, abstract, document type,
key sections, domain. Record a budget note: approximate char count of the
source and which excerpt windows were kept for the next stages.

## Stage 2 — structural (IMRaD / figures, score 1-10)

Assess structure: IMRaD fit (or equivalent), logical flow, figure/table
quality and numbering, missing sections. Emit a structural score 1-10 with
one-sentence justification.

## Stage 3 — claims (top-5 + Strong / Moderate / Weak / Unsupported)

List the top-5 empirical or theoretical claims. Rate each claim Strong,
Moderate, Weak, or Unsupported with a ≤40-word verbatim quote as evidence.
Run ≥1 citation-count check per top claim against the injected \`scholar_search\`
dossier (compare the claim's cited sources against dossier citationCount values;
a claim citing only low-citation work when the dossier shows a highly-cited
contradicting paper is Weak or Unsupported). Any \`claim_stance\` note ships ONLY
if a backend provides it — otherwise mark the stance UNVERIFIED (no scite
client exists; never promise parity).

## Stage 4 — methodology (stats / repro / threats)

Check: statistical adequacy (sample size, tests, error bars), baselines and
ablations, reproducibility (code/data availability, hyperparameter detail),
and threats to validity.

## Stage 5 — literature (coverage vs provided related-work list)

Compare coverage against the injected \`scholar_search\` dossier (≥5 papers with
title/year/citationCount/DOI) plus any caller-provided related-work list. Note
missing, mis-cited, or outdated references; flag coverage gaps where a dossier
paper with high citationCount is absent from the manuscript. The dossier counts
as bounded injected context under the staged budget. No web search in-skill: if
neither dossier nor related-work list is injected, mark coverage as unassessed
and cap
confidence at medium.

## Stage 6 — adversarial (breaker / butcher / collector roles)

Red-team the paper from three roles: breaker (find the fatal flaw),
butcher (argue for rejection in the strongest terms), collector (salvage
what is genuinely valuable even if the paper is rejected). The collector MUST
take ≥1 novelty-threat paper from the dossier recommendations/arXiv entries
and state whether it narrows the novelty claim.

## Stage 7 — synthesis (fixed sections + V1 scoring call)

Produce the review with EXACTLY these sections:

## Executive Summary
## Strengths
## Weaknesses
## Detailed Analysis
## Recommendations
## Verdict

Detailed Analysis covers the 6 V1 criteria (Novelty, Impact, Evaluation,
Rigor, Clarity, Grounding). Then invoke the V1 scoring call: emit the V1
rating JSON using the V1 schema field names (\`overall_score\`, \`evidence\`,
\`ethics_gate\`, \`quote\`).

## MUST DO

- Keep sampling temperature ≤0.2 for scoring runs (deterministic judgments).
- Read the paper via the \`document-reader\` tool before the intake stage.
- Enforce the staged context rule: bounded excerpts (≤4000 chars/stage),
  never the full PDF per stage.
- Emit the synthesis contract sections plus the V1 rating JSON.

## MUST NOT DO

- Do NOT pass the full PDF to any stage.
- Do NOT duplicate the V1 matrix (weights, anchors, thresholds live in the
  \`paper-review\` skill — reference it).
- Do NOT perform web search or HTTP calls in-skill; literature grounding
  uses only the injected \`scholar_search\` dossier / related-work list.
- Do NOT override a BLOCK ethics gate with a high overall score.
`,
}
