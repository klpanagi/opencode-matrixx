import type { BuiltinSkill } from "../types"

export const GRANT_WRITING_SKILL_NAME = "grant-writing"

export const GRANT_WRITING_SKILL_DESCRIPTION =
  "General grant and funding proposal writing beyond EU: NSF, NIH, ERC individual grants, national agencies, industry calls. Budget narratives, biosketches, broader impacts, evaluation criteria alignment, panel review processes. Triggers: 'grant proposal', 'NSF', 'NIH', 'funding application', 'research grant', 'budget narrative', 'broader impacts'."

export const grantWritingSkill: BuiltinSkill = {
  name: GRANT_WRITING_SKILL_NAME,
  description: GRANT_WRITING_SKILL_DESCRIPTION,
  template: `# Grant Writing — Comprehensive Reference (Non-EU Funders)

## MAJOR FUNDING AGENCIES

### NSF (National Science Foundation — US)
| Program | Budget Range | Duration | Key Feature |
|---------|-------------|----------|-------------|
| **CAREER** | $400K-$800K | 5 years | Early-career, education integration required |
| **Standard Grant** | $100K-$500K | 1-3 years | Single-PI research |
| **Collaborative** | Varies | 1-5 years | Multi-institution, coordinated submissions |
| **EAGER** | Up to $300K | 1-2 years | Exploratory, high-risk/high-reward |
| **RAPID** | Up to $200K | 1 year | Urgent research opportunities |

**NSF Merit Review Criteria:**
1. **Intellectual Merit**: advance knowledge, creative/original concepts, well-reasoned plan, qualified PI, adequate resources
2. **Broader Impacts**: societal benefit, broadening participation, educational integration, infrastructure for research/education

### NIH (National Institutes of Health — US)
| Mechanism | Purpose | Budget | Duration |
|-----------|---------|--------|----------|
| **R01** | Investigator-initiated research | No explicit cap (modular: $250K/yr direct) | 3-5 years |
| **R21** | Exploratory/developmental | $275K total (2 years) | 2 years |
| **R03** | Small research grant | $50K/yr | 2 years |
| **K99/R00** | Pathway to independence | K99: $100K/yr, R00: $249K/yr | 2+3 years |
| **U01** | Cooperative agreement | Varies | 3-5 years |

**NIH Review Criteria (scored 1-9):**
1. Significance — importance of the problem
2. Investigator(s) — qualifications and track record
3. Innovation — novel concepts, approaches, or methods
4. Approach — strategy, methodology, potential problems
5. Environment — institutional support, equipment, resources

### ERC Individual Grants
| Grant | Career Stage | Budget | Duration |
|-------|-------------|--------|----------|
| **Starting (StG)** | 2-7 years post-PhD | Up to €1.5M | 5 years |
| **Consolidator (CoG)** | 7-12 years post-PhD | Up to €2M | 5 years |
| **Advanced (AdG)** | Track record of 10+ years | Up to €2.5M | 5 years |
| **Synergy (SyG)** | 2-4 PIs, breakthrough research | Up to €10M | 6 years |

**ERC Evaluation:**
- Sole criterion: **Scientific Excellence**
- Sub-criteria: groundbreaking nature, ambition, feasibility
- PI's track record: publications, grants, impact relative to career stage

### National Agencies (Examples)
| Country | Agency | Focus |
|---------|--------|-------|
| UK | UKRI (EPSRC, AHRC, etc.) | Discipline-specific councils |
| Germany | DFG | Individual grants, collaborative research centres |
| France | ANR | Thematic and open calls |
| Japan | JSPS | Grants-in-Aid (KAKENHI) |
| Canada | NSERC, CIHR, SSHRC | Discovery, operating grants |
| Australia | ARC | Discovery, Linkage, DECRA |

## PROPOSAL STRUCTURE (GENERIC)

### Project Summary / Abstract (1 page)
- Problem statement and significance
- Objectives and specific aims
- Approach overview
- Expected outcomes and impact
- Write for non-specialist reviewers on the panel

### Specific Aims / Objectives (1 page — most critical page)
**Structure:**
1. **Opening paragraph**: establish importance, identify gap
2. **"Here we propose..."**: central hypothesis and approach
3. **Aim 1**: [specific, measurable objective]
4. **Aim 2**: [specific, measurable objective]
5. **Aim 3** (optional): [specific, measurable objective]
6. **Impact statement**: what success enables

**Rules:**
- Each aim should be independently achievable (not sequential dependencies)
- Aims should be synergistic but not dependent on each other
- If one aim fails, the proposal should still have value

### Research Plan / Strategy
| Section | Content | Typical Length |
|---------|---------|---------------|
| **Significance** | Why this matters, gap in knowledge, impact if successful | 1-2 pages |
| **Innovation** | What's new about your approach | 0.5-1 page |
| **Approach** | Detailed methodology per aim, preliminary data, timeline, pitfalls & alternatives | 5-10 pages |

### Budget and Justification
| Category | What to Include | Justification Needed |
|----------|-----------------|---------------------|
| **Personnel** | PI effort %, postdocs, students, technicians | Role and % effort per person |
| **Equipment** | Items > $5K (or agency threshold) | Why essential, no alternatives |
| **Travel** | Conferences, collaborator visits, fieldwork | Specific conferences/sites, purpose |
| **Materials & Supplies** | Consumables, software licenses | Itemized list with costs |
| **Participant Support** | Stipends, travel for participants | Number of participants, rates |
| **Other Direct** | Publication costs, subawards | Specific costs with basis |
| **Indirect (F&A)** | Overhead rate (institution-negotiated) | Per institutional rate agreement |

### Biographical Sketch / CV
- Focus on relevant publications and funding (not exhaustive CV)
- NSF: 2-page biosketch, 5 "closely related" + 5 "significant" products
- NIH: 4-page biosketch with personal statement per position
- Highlight: leadership, mentoring, service (not just publications)

## WRITING STRATEGY

### Reviewer Psychology
- Reviewers read 5-15 proposals in a batch — make yours easy to scan
- First impression matters: specific aims page sets the tone
- Reviewers look for reasons to say NO — eliminate ambiguity
- Enthusiasm must be justified — bold claims need preliminary data

### Persuasive Writing Techniques
| Technique | Example |
|-----------|---------|
| **Problem-solution framing** | "Current methods fail because X. We propose Y to address this." |
| **Preliminary data** | "Our pilot study shows [result], demonstrating feasibility." |
| **Quantifiable objectives** | "Aim 1 will achieve X% improvement in Y metric." |
| **Risk mitigation** | "If approach A fails, we will pursue alternative B because..." |
| **Broader vision** | "Success will enable [future direction] and impact [community]." |

### Common Rejection Reasons
| Reason | How to Prevent |
|--------|---------------|
| Lack of innovation | Clearly articulate what's new vs. state of the art |
| Overly ambitious | Scope to what's achievable; show preliminary data |
| Insufficient preliminary data | Include pilot results, even if small-scale |
| Methodology concerns | Detail protocols, justify choices, address pitfalls |
| Unclear significance | Connect to real-world impact, not just academic curiosity |
| Budget mismatch | Justify every item; ensure budget matches scope |
| Poor writing quality | Clear structure, headings, short paragraphs, visual aids |

## POST-SUBMISSION

### Panel Review Process (typical)
1. Written reviews (2-3 reviewers per proposal)
2. Panel discussion (reviewers present, panel debates)
3. Ranking and recommendation to program officer
4. Program officer makes funding decision (considers portfolio balance)

### Responding to Reviews (Resubmission)
- Address every critique explicitly
- Summary of changes at the top
- Show how feedback improved the proposal
- New preliminary data if methodology was questioned
- Don't be defensive — demonstrate you listened`,
}
