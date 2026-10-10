import type { BuiltinSkill } from "../types"

const PAPER_REVIEW_SKILL_NAME = "paper-review"

const PAPER_REVIEW_SKILL_DESCRIPTION =
  "Use when reviewing academic papers, scoring submissions, or screening manuscripts for quality — structured 6-criterion synthesis review with ethics gate, evidence quotes, and NeurIPS mapping. Related: document-reader, ulw-research."

export const paperReviewSkill: BuiltinSkill = {
  name: PAPER_REVIEW_SKILL_NAME,
  description: PAPER_REVIEW_SKILL_DESCRIPTION,
  allowedTools: ["document-reader"],
  template: `# Paper Review Skill

Structured V1 synthesis review for academic papers. Score each paper on 6 criteria,
recompute the weighted overall, enforce the ethics gate, and ground every score in
a verbatim evidence quote.

> UNVERIFIED: the 6-criterion set, weights, and criterion names below are a NEW
> synthesis authored for this skill. They are NOT ScholarFlow parity — ScholarFlow's
> GENERAL standard uses 7 criteria (Technical Soundness .20, Originality & Novelty
> .15, Significance & Impact .15, Clarity .15, Literature Grounding .15,
> Reproducibility .10, Ethics & Compliance .10). Do NOT claim equivalence.

## Scoring criteria (weights sum to 1.0)

| Criterion | Weight | What to assess |
|-----------|--------|----------------|
| Novelty | 0.25 | Originality of problem, approach, or insight vs prior work |
| Impact | 0.20 | Significance of results for the field or practice |
| Evaluation | 0.20 | Adequacy of experiments, baselines, ablations, metrics |
| Rigor | 0.15 | Methodological soundness, correctness of proofs/analysis |
| Clarity | 0.10 | Quality of writing, figures, structure, reproducibility of exposition |
| Grounding | 0.10 | Coverage and accuracy of related-work and citations |

## 5-band anchors (per criterion)

| Band | Range | Meaning |
|------|-------|---------|
| Weak | 1-20 | Missing or fundamentally flawed |
| Below bar | 21-40 | Present but seriously deficient |
| Borderline | 41-60 | Adequate with notable gaps |
| Strong | 61-80 | Solid with minor gaps |
| Excellent | 81-100 | Outstanding, sets a high bar |

## Formula

\`overall = round(Σ score×weight)\`, clamped to 1-100.

Weights: Novelty 0.25, Impact 0.20, Evaluation 0.20, Rigor 0.15, Clarity 0.10,
Grounding 0.10 (sum = 1.0).

Thresholds: ≥80 Accept / 60-79 Minor revision / 40-59 Major revision / <40 Reject.

## Guards

- Recompute check: re-derive \`overall_score\` from the six criterion scores and
  weights; if the reported value differs, use the recomputed value and note it in
  \`scoring_notes\`.
- Any criterion missing → confidence ≤ medium.

## Evidence-quote schema

Return one entry per criterion plus the summary fields:

\`\`\`json
{
  "evidence": [
    { "name": "Novelty", "score": 75, "quote": "verbatim ≤40 words", "location": "Section 3, p.4", "justification": "why this quote supports the score" }
  ],
  "overall_score": 68,
  "confidence": "high | medium | low",
  "confidence_reason": "one sentence",
  "scoring_notes": "recompute notes, missing criteria, caveats",
  "ethics_gate": "PASS | FLAG | BLOCK + reason"
}
\`\`\`

Rules: \`quote\` is a verbatim excerpt of ≤40 words from the paper; \`location\`
names the section/page; \`score\` is 1-100 per criterion.

## Ethics gate checklist

Check each: IRB approval (human subjects), informed consent, dual-use risk,
plagiarism / unattributed reuse, privacy / de-anonymization risk.

- PASS — no concerns found.
- FLAG — concern noted with reason; caps confidence at medium.
- BLOCK — severe concern with reason; overrides the recommendation to Reject
  regardless of \`overall_score\`.

## NeurIPS mapping

| NeurIPS dimension | Maps to (this skill) |
|-------------------|----------------------|
| Quality | Rigor + Evaluation |
| Clarity | Clarity |
| Significance | Impact |
| Originality | Novelty |

## MUST DO

- Keep sampling temperature ≤0.2 for scoring runs (deterministic judgments).
- Read the paper via the \`document-reader\` tool before scoring.
- Emit the full evidence-quote schema with all six criteria grounded in quotes.
- Apply the ethics gate before the final recommendation.

## MUST NOT DO

- Do NOT invent scores without a supporting verbatim quote.
- Do NOT claim ScholarFlow parity for the 6-criterion set (UNVERIFIED synthesis).
- Do NOT override a BLOCK ethics gate with a high overall score.
`,
}
