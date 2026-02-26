import type { BuiltinSkill } from "../types"

export const LITERATURE_REVIEW_SKILL_NAME = "literature-review"

export const LITERATURE_REVIEW_SKILL_DESCRIPTION =
  "Systematic literature review methodology: PRISMA guidelines, search strategy design, bibliometric analysis, gap identification, synthesis writing, scoping reviews, meta-analysis frameworks, reference management. Triggers: 'literature review', 'systematic review', 'PRISMA', 'bibliometric', 'state of the art', 'survey paper', 'meta-analysis'."

export const literatureReviewSkill: BuiltinSkill = {
  name: LITERATURE_REVIEW_SKILL_NAME,
  description: LITERATURE_REVIEW_SKILL_DESCRIPTION,
  template: `# Literature Review — Comprehensive Reference

## REVIEW TYPES

| Type | Purpose | Scope | Method |
|------|---------|-------|--------|
| **Narrative** | Broad overview of a topic | Wide, selective | Expert judgment, thematic grouping |
| **Systematic** | Exhaustive, reproducible survey | Defined by protocol | PRISMA, predefined inclusion/exclusion |
| **Scoping** | Map research landscape | Broad exploratory | PRISMA-ScR, charting data |
| **Meta-analysis** | Quantitative synthesis | Narrow, comparable studies | Statistical pooling of effect sizes |
| **Umbrella** | Review of reviews | Previous SLRs/meta-analyses | Synthesis of existing reviews |
| **Rapid** | Time-constrained evidence summary | Focused question | Simplified systematic process |

## PRISMA 2020 GUIDELINES

### Reporting Checklist (Key Items)
| Section | Items to Report |
|---------|----------------|
| **Title** | Identify as systematic review, meta-analysis, or both |
| **Abstract** | Structured: background, methods, results, conclusions |
| **Introduction** | Rationale, objectives, research questions |
| **Methods** | Protocol registration, eligibility criteria, search strategy, selection process, data extraction, risk of bias, synthesis methods |
| **Results** | Study selection (flow diagram), study characteristics, risk of bias, synthesis results |
| **Discussion** | Summary, limitations, implications |

### PRISMA Flow Diagram
\`\`\`
Records identified (n = ?)
  ├─ Database searching (n = ?)
  └─ Other sources (n = ?)
         │
    Duplicates removed (n = ?)
         │
    Records screened (n = ?)
    Records excluded (n = ?)
         │
    Full-text assessed (n = ?)
    Full-text excluded, with reasons (n = ?)
         │
    Studies included in qualitative synthesis (n = ?)
    Studies included in meta-analysis (n = ?)
\`\`\`

## SEARCH STRATEGY

### Database Selection
| Database | Domain | Coverage |
|----------|--------|----------|
| **Scopus** | Multidisciplinary | Largest abstract database, strong in STEM |
| **Web of Science** | Multidisciplinary | High-quality journals, citation tracking |
| **IEEE Xplore** | Engineering, CS | IEEE/IET publications, conference proceedings |
| **ACM Digital Library** | Computer Science | ACM journals, conferences, SIGs |
| **PubMed / MEDLINE** | Biomedical, life sciences | 35M+ citations, MeSH indexing |
| **Google Scholar** | Broad, grey literature | Wide coverage but less structured |
| **arXiv** | Physics, CS, Math | Preprints, recent cutting-edge work |
| **DBLP** | Computer Science | Comprehensive CS bibliography |

### Search Query Construction
- **Boolean operators**: AND (narrow), OR (broaden), NOT (exclude)
- **Wildcards**: * (truncation), ? (single character)
- **Phrase search**: "exact phrase" in quotes
- **Field-specific**: TITLE-ABS-KEY() in Scopus, TI= in WoS
- **PICO framework** (medical): Population, Intervention, Comparison, Outcome

**Example search string:**
\`\`\`
("deep learning" OR "neural network*") AND
("object detection" OR "visual recognition") AND
("autonomous driv*" OR "self-driving" OR "unmanned vehicle*")
\`\`\`

### Inclusion / Exclusion Criteria
| Criterion | Include | Exclude |
|-----------|---------|---------|
| **Time range** | Last 5-10 years (or justified period) | Outside range |
| **Language** | English (or specified languages) | Other languages |
| **Publication type** | Peer-reviewed journals, top conferences | Editorials, abstracts-only, posters |
| **Relevance** | Directly addresses RQ | Tangential mention only |
| **Quality** | Meets minimum methodological standards | Insufficient rigor |
| **Duplicates** | First/most complete version | Duplicate publications |

## SCREENING PROCESS

### Two-Phase Screening
1. **Title & abstract screening**: apply inclusion/exclusion, liberal (include if uncertain)
2. **Full-text screening**: detailed assessment against all criteria, document reasons for exclusion

### Inter-Rater Reliability
- Minimum 2 independent reviewers for screening
- Cohen's kappa (κ): ≥0.61 substantial, ≥0.81 almost perfect agreement
- Resolve disagreements: discussion → third reviewer
- Pilot: screen 50-100 papers together, calibrate criteria

## DATA EXTRACTION

### Extraction Form Fields
| Field | Content |
|-------|---------|
| **Study ID** | First author + year |
| **Venue** | Journal/conference name, impact factor |
| **Objective** | What the study aimed to do |
| **Method** | Approach, algorithm, framework used |
| **Dataset** | Data used, size, characteristics |
| **Key findings** | Main results, metrics, performance |
| **Limitations** | Reported limitations |
| **Relevance to RQ** | How it relates to your research questions |

## QUALITY ASSESSMENT

### Risk of Bias Tools
| Tool | Use For |
|------|---------|
| **Cochrane RoB 2** | Randomized controlled trials |
| **ROBINS-I** | Non-randomized interventional studies |
| **QUADAS-2** | Diagnostic accuracy studies |
| **Newcastle-Ottawa Scale** | Observational studies (cohort, case-control) |
| **Custom checklist** | CS/engineering studies (define per review) |

## SYNTHESIS & ANALYSIS

### Thematic Synthesis
1. Code extracted data line-by-line
2. Group codes into descriptive themes
3. Generate analytical themes (higher-order interpretation)
4. Map themes to research questions
5. Identify gaps, conflicts, and trends

### Bibliometric Analysis
| Metric | What It Shows |
|--------|--------------|
| **Publication trend** | Volume over time (growth/decline) |
| **Co-authorship network** | Collaboration patterns |
| **Co-citation analysis** | Intellectual foundations |
| **Keyword co-occurrence** | Topic clusters and evolution |
| **Geographic distribution** | Country/institution contributions |
| **Impact metrics** | Citation counts, h-index of key authors |

**Tools**: VOSviewer, Bibliometrix (R), CiteSpace, Gephi

### Gap Identification Framework
| Gap Type | Description | How to Identify |
|----------|-------------|-----------------|
| **Knowledge gap** | Unknown answer to a question | No studies found addressing the question |
| **Methodological gap** | Untested method for a known problem | Studies use method A but not method B |
| **Empirical gap** | Insufficient evidence | Few studies, small samples, contradictory results |
| **Theoretical gap** | Missing theoretical framework | Studies lack theoretical grounding |
| **Population gap** | Unstudied context/group | Studies cover domain X but not Y |

## META-ANALYSIS

### When Appropriate
- Comparable studies (similar populations, interventions, outcomes)
- Sufficient number of studies (typically ≥3)
- Quantitative outcomes reported with enough detail
- Heterogeneity is manageable (I² interpreted)

### Key Concepts
| Concept | Description |
|---------|-------------|
| **Effect size** | Standardized measure of magnitude (Cohen's d, OR, RR) |
| **Heterogeneity (I²)** | % of variation due to true differences (0-25% low, 25-75% moderate, >75% high) |
| **Forest plot** | Visual display of individual and pooled effects |
| **Funnel plot** | Publication bias assessment (asymmetry = bias) |
| **Random vs Fixed effects** | Random when heterogeneity expected, fixed when studies are functionally identical |
| **Sensitivity analysis** | Leave-one-out, influence diagnostics |
| **Subgroup analysis** | Compare effects across predefined subgroups |

## WRITING THE REVIEW

### Structure for Systematic Reviews
1. **Introduction**: motivation, RQs, scope
2. **Methodology**: protocol, search, screening, extraction, synthesis
3. **Results**: descriptive statistics, PRISMA flow, thematic findings
4. **Discussion**: synthesis, gaps, implications, limitations
5. **Conclusion**: answers to RQs, future directions

### Synthesis Writing Tips
- Organize by theme/concept, NOT study-by-study
- Compare and contrast findings across studies
- Highlight consensus AND contradictions
- Use summary tables for study characteristics
- Visualization: concept maps, trend charts, network graphs
- Avoid: uncritical listing ("Study A found X. Study B found Y.")`,
}
