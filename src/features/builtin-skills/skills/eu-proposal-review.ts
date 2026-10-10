import type { BuiltinSkill } from "../types"

export const EU_PROPOSAL_REVIEW_SKILL_NAME = "eu-proposal-review"

const EU_PROPOSAL_REVIEW_SKILL_DESCRIPTION =
  "Use when evaluating EU Horizon Europe proposals, scoring Excellence Impact Implementation, or reviewing RIA IA CSA bids — conditional 0-5 overlay with threshold 3 and funded 13-15 guidance. Related: paper-review, document-reader."

export const euProposalReviewSkill: BuiltinSkill = {
  name: EU_PROPOSAL_REVIEW_SKILL_NAME,
  description: EU_PROPOSAL_REVIEW_SKILL_DESCRIPTION,
  allowedTools: ["document-reader"],
  template: `# EU Proposal Review Skill

Conditional V3 overlay over the V1 \`paper-review\` skill. Runs ONLY when the
input declares an EU / Horizon Europe proposal (RIA, IA, CSA, ERC, MSCA, EIC);
otherwise defers to paper-review for general academic review.

> two-layer separation: this overlay MUST NOT merge into V1 scoring. V1 keeps
> its 6-criterion 1-100 synthesis; this layer adds Horizon Europe 0-5
> Excellence / Impact / Implementation scoring on top. Keep the two layers
> distinct in the output.

## Conditional gate

- IF the input mentions Horizon Europe, EU proposal, Part B, RIA/IA/CSA,
  Work Programme topic, TRL, or person-months → run this overlay.
- ELSE → defers to paper-review: do not apply EU thresholds, weights, or
  Part B critique; run the V1 flow unchanged.

## Scoring framework (RIA/IA — copy of ScholarFlow EU thresholds)

Each criterion is scored 0-5 (half points allowed). The threshold for each
criterion is 3/5. Overall score is out of /15 (sum of the three scores).
Funded proposals typically score 13-15/15 overall (funded ≈13-15).

### 1. Excellence (weight 40%, scored 0-5, threshold 3)
- Clarity and pertinence of objectives (SMART)
- Credibility of the proposed methodology
- Concept and approach — novelty beyond state of the art
- Ambition — breakthrough potential
- Ground novelty/state-of-the-art claims in the injected \`scholar_search\` dossier:
  cite ≥1 dossier paper (title/year/citationCount/DOI) when asserting beyond-SoTA
  or breakthrough potential; if no dossier is injected, mark novelty UNVERIFIED
  and cap Excellence confidence at medium. The dossier counts as bounded
  injected context. Any \`claim_stance\` note ships ONLY if a backend provides it,
  otherwise mark it UNVERIFIED (no scite client exists; never promise parity).

### 2. Impact (weight 30%, scored 0-5, threshold 3)
- Expected scientific, societal, and economic impacts
- Dissemination, exploitation, and communication plan (with KPIs)
- Pathways to impact beyond the project lifetime
- Contribution to the expected impacts in the Work Programme topic

### 3. Quality and Efficiency of Implementation (weight 30%, scored 0-5, threshold 3)
- Coherence and effectiveness of the work plan (WBS, Gantt, milestones, deliverables)
- Consortium composition — complementarity, expertise, geographical balance
- Resources — budget justification, person-months, equipment

Weights: Excellence 40%, Impact 30%, Implementation 30%. Per-criterion
threshold 3; overall /15; funded ≈13-15; half-points allowed.

Verdict mapping: Fund / Revise-and-Resubmit / Reject. Fund requires every
criterion at or above its threshold 3 and an overall near funded ≈13-15;
any criterion below threshold 3 → Revise-and-Resubmit or Reject.

## Part B structure critique

Assess each section of the proposal description:
- **B1 Excellence** (10-12 pages): objectives (SMART), relation to WP topic, concept/methodology, ambition
- **B2 Impact** (8-10 pages): outcomes, dissemination/exploitation/communication, WP contribution
- **B3 Implementation** (10-12 pages): work plan, consortium capacity, resources
- **B4 Additional** (5-8 pages): ethics and security, CVs, letters of commitment, subcontracting
- **B5 Declaration**: ownership, copyright, previous submissions

Checklist: B1 Excellence / B2 Impact / B3 Implementation / B4 Additional
incl. ethics+security / B5 Declaration — flag any missing or underweight
section with page-count evidence.

## Red flags

- Objectives not SMART or not aligned with the topic text
- No risk register with mitigation measures
- Unrealistic person-months or budget not aligned with tasks (person-months/budget alignment)
- Consortium imbalance (geographic, sectoral) or overlapping partner roles (consortium balance)
- Missing ethics self-assessment or sensitive-topic handling
- No Data Management Plan (DMP/FAIR) for research data
- No dissemination/exploitation plan with concrete KPIs
- Page-limit violations or missing required sections (page limits)
- No gender dimension in research content (gender dimension)
- TRL mismatch between the proposed work and the instrument (TRL mismatch)

## Evidence-quote + ethics-gate conventions (reused from V1)

Reuse the V1 paper-review conventions, adapted to 0-5 scores: every
Excellence / Impact / Implementation score MUST be grounded in a verbatim
evidence quote (quote ≤40 words + location section/page + justification),
returned in the V1 evidence-quote shape with overall_score, confidence, and
ethics_gate (PASS | FLAG | BLOCK + reason). A BLOCK ethics gate overrides
the verdict to Reject regardless of the /15 total.

## Output format

1. **Summary** — 2-3 sentences on the proposal's core idea and overall quality
2. **Per-criterion scores** — Excellence / Impact / Implementation, each 0-5 with justification
3. **Overall score** — X/15 with verdict Fund / Revise-and-Resubmit / Reject
4. **Strengths** — numbered list with specific evidence from the proposal
5. **Weaknesses** — numbered list, each with a concrete fix
6. **Red flags** — critical issues triggering low score or disqualification
7. **Prioritized recommendations** — Critical (must fix) / Important (should fix) / Minor (nice to have)

Be specific — reference sections, page numbers, and budget tables. Never
invent details not present in the proposal text.

## MUST DO

- Keep sampling temperature ≤0.2 for scoring runs (deterministic judgments).
- Read the proposal via the \`document-reader\` tool before scoring.
- Apply the conditional gate first; when EU/Horizon input is absent, defer to paper-review.
- Ground every 0-5 score in a verbatim evidence quote with location.
- Apply the ethics gate before the final verdict.

## MUST NOT DO

- Do NOT merge into V1 scoring — keep the two-layer separation.
- Do NOT invent EU thresholds — use 0-5, threshold 3, funded ≈13-15 only.
- Do NOT invent scores without a supporting verbatim quote.
- Do NOT override a BLOCK ethics gate with a high overall score.
`,
}
