import type { BuiltinSkill } from "../types"

export const RESEARCH_METHODOLOGY_SKILL_NAME = "research-methodology"

export const RESEARCH_METHODOLOGY_SKILL_DESCRIPTION =
  "Research design and methodology: quantitative/qualitative/mixed methods, hypothesis formulation, experimental design, statistical analysis, sampling strategies, validity/reliability, survey design, ethical considerations. Triggers: 'research design', 'methodology', 'hypothesis', 'statistical analysis', 'experiment design', 'sampling', 'survey'."

export const researchMethodologySkill: BuiltinSkill = {
  name: RESEARCH_METHODOLOGY_SKILL_NAME,
  description: RESEARCH_METHODOLOGY_SKILL_DESCRIPTION,
  template: `# Research Methodology — Comprehensive Reference

## RESEARCH PARADIGMS

| Paradigm | Ontology | Epistemology | Methods | When to Use |
|----------|----------|-------------|---------|-------------|
| **Positivist** | Single objective reality | Observable, measurable | Experiments, surveys, statistics | Testing causal hypotheses |
| **Interpretivist** | Multiple constructed realities | Co-constructed understanding | Interviews, ethnography, case studies | Understanding human experience |
| **Pragmatist** | Reality is practical consequences | What works for the question | Mixed methods | Solving practical problems |
| **Critical** | Shaped by power structures | Emancipatory knowledge | Action research, discourse analysis | Addressing inequality, systemic issues |

## HYPOTHESIS FORMULATION

### Structure
- **Null hypothesis (H₀)**: no effect/difference/relationship
- **Alternative hypothesis (H₁)**: the predicted effect
- **Directional**: specifies direction ("increases", "greater than")
- **Non-directional**: specifies existence only ("differs", "related to")

### Quality Criteria
- Testable (can be empirically evaluated)
- Falsifiable (possible to disprove)
- Specific (operationalized variables)
- Grounded (based on theory or prior evidence)

### From RQ to Hypothesis
| Research Question | Hypothesis |
|-------------------|-----------|
| "Does X affect Y?" | "X significantly increases Y compared to control" |
| "Is there a relationship between A and B?" | "A is positively correlated with B (r > 0)" |
| "Which method performs better?" | "Method M₁ outperforms M₂ on metric Z (p < 0.05)" |

## EXPERIMENTAL DESIGN

### Design Types
| Design | Description | Strengths | Weaknesses |
|--------|-------------|-----------|------------|
| **Between-subjects** | Different groups per condition | No carryover effects | Needs more participants |
| **Within-subjects** | Same group, all conditions | Fewer participants, controls individual differences | Order effects, fatigue |
| **Factorial** | Multiple IVs crossed | Interaction effects | Complexity, sample size |
| **Counterbalanced** | Systematic order variation | Controls order effects | Complex administration |

### Variables
- **Independent Variable (IV)**: what you manipulate
- **Dependent Variable (DV)**: what you measure
- **Confounding Variable**: uncontrolled factor that affects DV
- **Control Variable**: held constant across conditions

### Validity
| Type | Threat | Mitigation |
|------|--------|------------|
| **Internal** | Confounds, selection bias, maturation | Random assignment, control groups, blinding |
| **External** | Lab vs real-world, sample specificity | Diverse samples, field studies, replication |
| **Construct** | Poor operationalization, demand characteristics | Multiple measures, pilot testing, manipulation checks |
| **Statistical Conclusion** | Low power, violation of assumptions | Power analysis, assumption testing, effect sizes |

## SAMPLING STRATEGIES

### Probability Sampling
| Method | How | When |
|--------|-----|------|
| **Simple random** | Each element has equal chance | Homogeneous population, sampling frame available |
| **Stratified** | Divide into strata, random within each | Known subgroups, ensure representation |
| **Cluster** | Random selection of groups | Geographically dispersed, no complete list |
| **Systematic** | Every k-th element | Ordered list available, no periodicity |

### Non-Probability Sampling
| Method | How | When |
|--------|-----|------|
| **Purposive** | Researcher selects based on criteria | Qualitative, expert sampling |
| **Snowball** | Participants recruit others | Hard-to-reach populations |
| **Convenience** | Whoever is available | Pilot studies, exploratory research |
| **Quota** | Proportional to population characteristics | Quick, approximate representativeness |

### Sample Size Determination
- **Power analysis**: specify α (0.05), power (0.80), effect size → compute N
- **Cohen's conventions**: small (d=0.2), medium (d=0.5), large (d=0.8)
- **Rules of thumb**: 30+ per group (t-test), 10-15 per predictor (regression)
- **Qualitative**: saturation (typically 15-30 interviews, 3-5 focus groups)

## STATISTICAL ANALYSIS

### Choosing the Right Test
| Data Type | Groups | Test |
|-----------|--------|------|
| Continuous, 2 groups | Independent | Independent t-test (or Mann-Whitney U) |
| Continuous, 2 groups | Paired | Paired t-test (or Wilcoxon signed-rank) |
| Continuous, 3+ groups | Independent | One-way ANOVA (or Kruskal-Wallis) |
| Continuous, 3+ groups | Repeated | Repeated measures ANOVA (or Friedman) |
| Continuous × Continuous | Correlation | Pearson r (or Spearman ρ) |
| Continuous → Continuous | Prediction | Linear regression |
| Categorical × Categorical | Association | Chi-square (or Fisher's exact) |
| Multiple predictors | Prediction | Multiple regression / logistic regression |

### Reporting Statistics
- Always report: test statistic, df, p-value, effect size, confidence interval
- Format: "t(28) = 2.45, p = .021, d = 0.89, 95% CI [0.12, 1.66]"
- p-values: exact values (not "p < 0.05" unless p < .001)
- Effect sizes: Cohen's d, η², r², odds ratio (depending on test)
- Significance ≠ importance: always discuss practical significance

### Assumptions to Check
| Test | Assumptions |
|------|------------|
| **t-test** | Normality (Shapiro-Wilk), homogeneity of variance (Levene's) |
| **ANOVA** | Normality, homogeneity, independence |
| **Regression** | Linearity, normality of residuals, homoscedasticity, independence, no multicollinearity |
| **Chi-square** | Expected frequencies ≥ 5, independence |

## QUALITATIVE METHODS

### Data Collection
| Method | Data Type | Sample Size | Duration |
|--------|-----------|-------------|----------|
| **Semi-structured interviews** | Rich individual perspectives | 15-30 | 45-90 min each |
| **Focus groups** | Group dynamics, shared meaning | 3-5 groups of 6-10 | 60-120 min |
| **Observation** | Behavior in context | Varies | Days to months |
| **Think-aloud protocol** | Cognitive processes | 5-15 | 30-60 min |
| **Document analysis** | Textual evidence | Varies | Varies |

### Analysis Approaches
| Method | Purpose | Process |
|--------|---------|---------|
| **Thematic analysis** | Identify themes/patterns | Code → categorize → define themes → report |
| **Grounded theory** | Build theory from data | Open coding → axial coding → selective coding → theory |
| **Content analysis** | Quantify qualitative data | Define categories → code systematically → count/compare |
| **Discourse analysis** | Language and power | Examine language use, context, social construction |

### Rigor in Qualitative Research
| Quantitative | Qualitative Equivalent | Strategy |
|-------------|----------------------|----------|
| Internal validity | Credibility | Member checking, triangulation, prolonged engagement |
| External validity | Transferability | Thick description, purposive sampling |
| Reliability | Dependability | Audit trail, inter-coder reliability |
| Objectivity | Confirmability | Reflexivity journal, peer debriefing |

## MIXED METHODS

### Designs
| Design | Sequence | Purpose |
|--------|----------|---------|
| **Convergent** | QUAL + QUAN simultaneously | Compare/merge findings |
| **Explanatory sequential** | QUAN → qual | Explain quantitative results |
| **Exploratory sequential** | QUAL → quan | Develop instrument/theory, then test |
| **Embedded** | One within the other | Supportive role for secondary method |

## ETHICAL CONSIDERATIONS

### Research Ethics Checklist
- [ ] Informed consent: purpose, procedures, risks, voluntary participation
- [ ] Anonymity/confidentiality: data de-identification, secure storage
- [ ] Right to withdraw: at any time, without consequence
- [ ] Vulnerable populations: additional safeguards, guardian consent
- [ ] Data protection: GDPR compliance, retention period, destruction plan
- [ ] Ethics board approval: IRB/REC submission before data collection
- [ ] Deception: justified only when necessary, full debrief after
- [ ] Conflict of interest: disclosed and managed`,
}
