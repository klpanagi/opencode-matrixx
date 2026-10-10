# Paper Review: Appendix (NeurIPS + Horizon + 9-Standard Compatibility)

> UNVERIFIED: the V1 6-criterion set below is a NEW synthesis authored for the
> `paper-review` skill. It is NOT ScholarFlow parity. Compatibility is presented
> as mapping with explicit deltas, NOT equivalence.

V1 weights (from `src/features/builtin-skills/skills/paper-review.ts`):
Novelty .25 / Impact .20 / Evaluation .20 / Rigor .15 / Clarity .10 / Grounding .10.

IEEE baseline (from `rubric_standards.py:36-127`):
Technical Soundness .25 / Originality & Novelty .15 / Significance & Impact .15 /
Clarity of Presentation .15 / Literature Grounding .15 / Reproducibility .10 /
Ethics & Compliance .05.

## (a) NeurIPS form mapping

Reviewer guidelines (citation only, no scraping):
https://neurips.cc/Conferences/2024/ProgramCommitteeGuidelines — accessed 2026-10-08.

| NeurIPS dimension | Maps to V1 | Notes |
|-------------------|------------|-------|
| Quality | Rigor (.15) + Evaluation (.20) | V1 splits IEEE-style Technical Soundness .25 into two criteria totalling .35. UNVERIFIED divergence: delta +.10 vs IEEE baseline. |
| Clarity | Clarity (.10) | Narrower than IEEE Clarity .15. Delta -.05 vs IEEE baseline. |
| Significance | Impact (.20) | V1 upweights vs IEEE Significance & Impact .15. Delta +.05. |
| Originality | Novelty (.25) | V1 upweights vs IEEE Originality & Novelty .15. Delta +.10. UNVERIFIED divergence. |

Confidence mapping: any V1 criterion missing a verbatim evidence quote caps
confidence at medium; ethics FLAG caps at medium; ethics BLOCK overrides the
recommendation to Reject regardless of overall score.

## (b) Horizon Europe crosswalk

Source: ScholarFlow `scholarflow_skills.py` `eu-horizon` block and
`eu-proposal-review` seed (Excellence 0-5 threshold 3 weight 40% / Impact 0-5
threshold 3 weight 30% / Implementation 0-5 threshold 3 weight 30%; funded
13-15/15; half-points allowed).

| Horizon criterion | Maps to V1 | Notes |
|-------------------|------------|-------|
| Excellence (40%) | Novelty (.25) + Rigor (.15) | Ambition/concept map to Novelty; SMART objectives and methodology credibility map to Rigor. Scale differs (0-5 vs 1-100): mapping only, no score conversion. |
| Impact (30%) | Impact (.20) | Direct name match; V1 Impact also absorbs dissemination/exploitation pathways. |
| Implementation (30%) | Evaluation (.20) + Grounding (.10) | Work-plan coherence and resources map to Evaluation; consortium/state-of-art positioning maps partly to Grounding. V1 has no budget/consortium criteria: partial mapping only. |

## (c) 9-standard compatibility matrix

Rows: V1 criterion. Columns: each ScholarFlow standard (ieee / acm / nature /
springer_nature / softwarex / plos / elsevier / medical / general).
Cell: matching standard criterion + weight delta (standard weight minus V1
weight, vs V1; IEEE-baseline delta column shows V1 minus IEEE).

| V1 criterion (V1 wt) | ieee | acm | nature | springer_nature | softwarex | plos | elsevier | medical | general | delta vs IEEE baseline |
|----------------------|------|-----|--------|-----------------|-----------|------|----------|---------|---------|------------------------|
| Novelty (.25) | Originality & Novelty .15, delta -.10 | Originality & Novelty .15, delta -.10 | Originality & Novelty .15, delta -.10 | Originality & Novelty .15, delta -.10 | (no direct match; closest Impact & Reusability .20), delta -.05 | Originality & Novelty .00, delta -.25 | Originality & Novelty .15, delta -.10 | Originality & Novelty .10, delta -.15 | Originality & Novelty .15, delta -.10 | V1 +.10 vs IEEE (UNVERIFIED divergence) |
| Impact (.20) | Significance & Impact .15, delta -.05 | Significance & Impact .15, delta -.05 | Significance & Impact .25, delta +.05 | Significance & Impact .25, delta +.05 | Impact & Reusability .20, delta .00 | Significance & Impact .00, delta -.20 | Significance & Impact .15, delta -.05 | Significance & Impact .15, delta -.05 | Significance & Impact .15, delta -.05 | V1 +.05 vs IEEE |
| Evaluation (.20) | (split from Technical Soundness .25), delta +.05 | (split from Technical Soundness .20), delta .00 | (split from Technical Soundness .20), delta .00 | (split from Technical Soundness .20), delta .00 | Technical Soundness .15, delta -.05 | (split from Technical Soundness .40), delta +.20 | (split from Technical Soundness .20), delta .00 | (split from Technical Soundness .20), delta .00 | (split from Technical Soundness .20), delta .00 | UNVERIFIED: Evaluation/Rigor split of TechSound .25 |
| Rigor (.15) | (split from Technical Soundness .25), delta +.10 | (split from Technical Soundness .20), delta +.05 | (split from Technical Soundness .20), delta +.05 | (split from Technical Soundness .20 + Statistics & Data Quality .15), delta +.05 | Technical Soundness .15, delta .00 | (split from Technical Soundness .40), delta +.25 | (split from Technical Soundness .20), delta +.05 | (split from Technical Soundness .20), delta +.05 | (split from Technical Soundness .20), delta +.05 | UNVERIFIED: Evaluation/Rigor split of TechSound .25 |
| Clarity (.10) | Clarity of Presentation .15, delta +.05 | Clarity of Presentation .15, delta +.05 | Clarity of Presentation .10, delta .00 | Clarity of Presentation .10, delta .00 | Clarity of Presentation .10, delta .00 | Clarity of Presentation .20, delta +.10 | Clarity of Presentation .15, delta +.05 | Clarity of Presentation .15, delta +.05 | Clarity of Presentation .15, delta +.05 | V1 -.05 vs IEEE |
| Grounding (.10) | Literature Grounding .15, delta +.05 | Literature Grounding .15, delta +.05 | Literature Grounding .15, delta +.05 | Literature Grounding .10, delta .00 | Literature Grounding .05, delta -.05 | Literature Grounding .10, delta .00 | Literature Grounding .15, delta +.05 | Literature Grounding .15, delta +.05 | Literature Grounding .15, delta +.05 | V1 -.05 vs IEEE |

Notes:

- PLOS assigns .00 to Originality & Novelty and Significance & Impact
  (soundness-only review): the Novelty -.25 and Impact -.20 deltas are the
  largest in the matrix and must not be read as equivalence.
- V1 has no Ethics or Reproducibility criterion; those standard weights have no
  V1 counterpart (ethics is a gate, not a scored criterion).
- All deltas above are standard-minus-V1 per cell; the final column is V1-minus-IEEE.

## (d) UNVERIFIED flags

- UNVERIFIED: V1 Novelty .25 vs IEEE Originality & Novelty .15 (delta +.10).
- UNVERIFIED: V1 Evaluation (.20) + Rigor (.15) split of IEEE Technical
  Soundness (.25); combined .35 vs .25 (delta +.10).
- UNVERIFIED: the 6-criterion set as a whole is not ScholarFlow parity.
