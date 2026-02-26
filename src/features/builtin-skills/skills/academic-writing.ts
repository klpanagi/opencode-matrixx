import type { BuiltinSkill } from "../types"

export const ACADEMIC_WRITING_SKILL_NAME = "academic-writing"

export const ACADEMIC_WRITING_SKILL_DESCRIPTION =
  "Academic paper writing for journals and conferences: IMRaD structure, abstract crafting, argumentation flow, citation practices, venue-specific formatting (IEEE/ACM/Springer/Elsevier), camera-ready preparation, cover letters, rebuttals. Triggers: 'write paper', 'journal article', 'conference paper', 'abstract', 'rebuttal', 'camera-ready'."

export const academicWritingSkill: BuiltinSkill = {
  name: ACADEMIC_WRITING_SKILL_NAME,
  description: ACADEMIC_WRITING_SKILL_DESCRIPTION,
  template: `# Academic Paper Writing — Comprehensive Reference

## PAPER STRUCTURE (IMRaD)

### Title
- Concise, informative, searchable (include key terms)
- Avoid: questions, abbreviations, jargon, "A Study of..."
- Pattern: \`[Method/Approach] for [Problem] in [Domain]: [Key Result]\`
- Max ~15 words for journals, ~10 for conferences

### Abstract (150-300 words)
| Section | Content | Sentences |
|---------|---------|-----------|
| **Context** | Why this matters, gap in knowledge | 1-2 |
| **Objective** | What we set out to do | 1 |
| **Method** | How we did it (approach, data, evaluation) | 2-3 |
| **Results** | Key quantitative findings | 2-3 |
| **Conclusion** | Implications, significance | 1-2 |

- Write LAST (after full paper is drafted)
- No citations, no undefined acronyms, no future tense
- Every claim must be supported in the paper body

### Introduction (10-15% of paper)
**Funnel structure:**
1. **Broad context**: establish the domain and its importance
2. **Specific problem**: narrow to the gap your work addresses
3. **Why it matters**: practical/theoretical significance
4. **Existing approaches**: brief survey of prior work (NOT the full related work)
5. **Limitations of existing work**: what's missing or insufficient
6. **Your contribution**: explicit numbered list of contributions
7. **Paper organization**: "The remainder of this paper is organized as follows..."

### Related Work (10-15% of paper)
- Organize thematically, NOT chronologically
- Group by approach type, problem variant, or technique
- For each group: summarize, then differentiate from your work
- End each paragraph with positioning: how your work differs
- Be fair to competitors — misrepresentation undermines credibility

### Methodology / Approach (25-30% of paper)
- Enough detail for reproducibility
- Formal notation: define all symbols before use
- Algorithm pseudocode for complex procedures
- Architecture diagrams for system papers
- Justify design choices (why this method over alternatives)
- State assumptions explicitly

### Experiments / Evaluation (25-30% of paper)
| Component | Content |
|-----------|---------|
| **Research questions** | RQ1, RQ2, ... — what specifically are you evaluating? |
| **Datasets** | Source, size, preprocessing, train/val/test splits |
| **Baselines** | State-of-the-art comparisons, ablation variants |
| **Metrics** | Standard metrics for the domain + justification |
| **Setup** | Hardware, software versions, hyperparameters |
| **Results** | Tables/figures with statistical significance |
| **Analysis** | Why results look the way they do |
| **Limitations** | Honest assessment of what doesn't work |

### Discussion
- Interpret results in context of research questions
- Compare with related work quantitatively
- Explain unexpected results
- Discuss generalizability and external validity
- Address limitations honestly (reviewers respect transparency)

### Conclusion
- Restate contributions (NOT copy-paste from intro)
- Summarize key findings with specific numbers
- Future work: concrete next steps, not vague promises
- Do NOT introduce new information

## VENUE-SPECIFIC FORMATTING

### IEEE Transactions / Conferences
- Two-column format, Times New Roman 10pt
- Section numbering: I, II, III (Roman numerals)
- References: numbered [1], [2] in order of appearance
- Figures/tables: "Fig. 1" and "TABLE I"
- Abstract: max 200 words, no math

### ACM (SIGCHI, SIGPLAN, etc.)
- \`acmart\` document class: \`\\documentclass[sigconf]{acmart}\`
- CCS concepts required
- Author keywords (3-5)
- References: author-year or numbered (venue-specific)

### Springer (LNCS)
- \`llncs\` document class
- Max 12-16 pages (including references)
- Abstract: max 200 words
- References: numbered [1] in order of appearance

### Elsevier
- Single-column or two-column (journal-specific)
- Highlights: 3-5 bullet points (max 85 chars each)
- Graphical abstract (many journals)
- Author contributions statement (CRediT taxonomy)

## WRITING QUALITY

### Argumentation Flow
- Each paragraph: topic sentence → evidence → analysis → link to next
- Each section: preview → body → summary → transition
- Claims require evidence: data, citation, or logical derivation
- Hedging: "suggests", "indicates", "appears to" (appropriate uncertainty)
- Avoid: "obviously", "clearly", "it is well known" (dismissive)

### Common Weaknesses to Avoid
| Weakness | Fix |
|----------|-----|
| Overclaiming | Qualify with evidence bounds, use hedging language |
| Missing baselines | Include at least 2-3 SOTA comparisons |
| No ablation study | Test each component's contribution independently |
| Vague contribution | Number contributions, make each specific and verifiable |
| Wall of text | Break into subsections, use bullet points, add visuals |
| Inconsistent notation | Define notation once (Notation section), use consistently |
| Passive voice overuse | Mix active/passive; active for your contributions |

### Citation Practices
- Cite seminal works AND recent work (last 2-3 years)
- Self-citation: keep under 15-20% of references
- Cite to credit, not to pad — each citation should serve a purpose
- When paraphrasing, ensure the citation supports the specific claim
- Primary sources preferred over surveys (except for breadth coverage)

## SUBMISSION ARTIFACTS

### Cover Letter
1. Manuscript title and authors
2. Brief summary (2-3 sentences)
3. Why this journal/conference is appropriate
4. Statement of originality and no concurrent submission
5. Suggested reviewers (if required): 3-5 with justification
6. Excluded reviewers (if needed): with brief reason

### Rebuttal / Response to Reviewers
- Address EVERY comment (number them: R1.1, R1.2, R2.1, ...)
- Structure: [Reviewer comment] → [Response] → [Changes made]
- Be respectful even when disagreeing
- Quote specific changes with page/line numbers
- If rejecting a suggestion, explain why with evidence
- Summary of major changes at the top

### Camera-Ready Checklist
- [ ] All reviewer comments addressed
- [ ] Page limit respected (including references if counted)
- [ ] Figures: high resolution (300+ DPI), readable in grayscale
- [ ] Tables: consistent formatting, no orphan headers
- [ ] References: complete (no "et al." in reference list), consistent format
- [ ] Author names and affiliations match submission system
- [ ] Copyright/license form signed
- [ ] Supplementary materials uploaded (code, data, appendix)
- [ ] DOI links for all references that have them`,
}
