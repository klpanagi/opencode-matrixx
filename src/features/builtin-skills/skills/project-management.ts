import type { BuiltinSkill } from "../types"

export const PROJECT_MANAGEMENT_SKILL_NAME = "project-management"

export const PROJECT_MANAGEMENT_SKILL_DESCRIPTION =
  "Project management expertise: Agile/Scrum/Kanban, Waterfall, risk management, stakeholder engagement, resource planning, WBS, Gantt charts, earned value management, team coordination, status reporting. Triggers: 'project plan', 'sprint', 'stakeholder', 'risk register', 'Gantt', 'WBS', 'resource allocation'."

export const projectManagementSkill: BuiltinSkill = {
  name: PROJECT_MANAGEMENT_SKILL_NAME,
  description: PROJECT_MANAGEMENT_SKILL_DESCRIPTION,
  template: `# Project Management — Comprehensive Reference

## METHODOLOGIES

### Agile / Scrum
| Artifact | Purpose | Owner |
|----------|---------|-------|
| **Product Backlog** | Ordered list of everything needed in the product | Product Owner |
| **Sprint Backlog** | Selected items for current sprint + plan to deliver | Development Team |
| **Increment** | Sum of all completed backlog items | Development Team |

**Ceremonies:**
- Sprint Planning: capacity-based selection, define Sprint Goal
- Daily Standup: 15 min, blockers + plan for the day
- Sprint Review: demo increment to stakeholders, gather feedback
- Sprint Retrospective: what went well / what to improve / action items

**Estimation:** Story points (Fibonacci: 1,2,3,5,8,13,21), Planning Poker, T-shirt sizing
**Velocity:** avg story points completed per sprint (use 3-sprint rolling average)

### Kanban
- Visualize workflow (To Do → In Progress → Review → Done)
- WIP limits per column (prevents bottlenecks)
- Lead time & cycle time metrics
- Continuous flow (no fixed sprints)

### Waterfall / V-Model
- Sequential phases: Requirements → Design → Implementation → Verification → Maintenance
- Gate reviews between phases
- Change control board (CCB) for scope changes
- Suited for: regulated industries, fixed-scope contracts, hardware-dependent projects

## PLANNING ARTIFACTS

### Work Breakdown Structure (WBS)
- Decompose deliverables into work packages (max 80-hour rule)
- Numbering: 1.0 → 1.1 → 1.1.1 (indent = detail level)
- Each leaf node = assignable, estimable, trackable
- Dictionary entry per package: scope, owner, effort, dependencies

### Gantt Chart Construction
- Map WBS packages to timeline
- Identify dependencies: FS (Finish-to-Start), SS, FF, SF
- Mark milestones (zero-duration diamond markers)
- Critical path = longest path through network (zero float)
- Buffer management: project buffer at end, feeding buffers at merge points

### Resource Planning
- RACI matrix: Responsible / Accountable / Consulted / Informed
- Resource histogram: person-months per role per period
- Capacity planning: available hours × utilization factor (typically 0.8)
- Conflict resolution: priority-based allocation, resource leveling

## RISK MANAGEMENT

### Risk Register Structure
| Field | Content |
|-------|---------|
| **ID** | R-001, R-002, ... |
| **Description** | Clear statement of uncertainty event |
| **Probability** | 1-5 scale (1=Rare, 5=Almost Certain) |
| **Impact** | 1-5 scale (1=Negligible, 5=Critical) |
| **Risk Score** | P × I (1-25) |
| **Category** | Technical / Schedule / Cost / Resource / External |
| **Owner** | Person responsible for monitoring |
| **Mitigation** | Specific actions to reduce P or I |
| **Contingency** | Fallback plan if risk materializes |
| **Status** | Open / Mitigating / Closed / Materialized |

### Risk Response Strategies
- **Avoid**: eliminate the threat (change scope/approach)
- **Transfer**: shift to third party (insurance, subcontract)
- **Mitigate**: reduce probability or impact
- **Accept**: acknowledge and budget contingency
- **Exploit** (opportunity): ensure positive risk occurs
- **Escalate**: beyond project authority → program/portfolio level

## STAKEHOLDER MANAGEMENT

### Stakeholder Analysis
- Power/Interest grid: Manage Closely (high/high) → Keep Satisfied (high/low) → Keep Informed (low/high) → Monitor (low/low)
- Salience model: Power × Legitimacy × Urgency
- Engagement assessment: Unaware → Resistant → Neutral → Supportive → Leading

### Communication Plan
| Stakeholder Group | Frequency | Channel | Content | Owner |
|-------------------|-----------|---------|---------|-------|
| Steering Committee | Monthly | Meeting + report | Status, risks, decisions | PM |
| Product Owner | Weekly | Standup / Slack | Priorities, blockers | Scrum Master |
| Dev Team | Daily | Standup | Tasks, blockers | Team Lead |
| End Users | Quarterly | Newsletter / demo | Features, timeline | PM |

## STATUS REPORTING

### Weekly Status Report Template
1. **Executive Summary**: 2-3 sentences on overall health
2. **RAG Status**: Red/Amber/Green for Schedule, Budget, Scope, Quality
3. **Accomplishments**: completed items this period
4. **Planned Next**: items for next period
5. **Risks & Issues**: top 3 with mitigation status
6. **Decisions Needed**: items requiring stakeholder input
7. **Metrics**: velocity, burn-down/up, defect rate

### Earned Value Management (EVM)
| Metric | Formula | Meaning |
|--------|---------|---------|
| **PV** (Planned Value) | Budgeted cost of work scheduled | What should have been done |
| **EV** (Earned Value) | Budgeted cost of work performed | What was actually done |
| **AC** (Actual Cost) | Actual cost of work performed | What it actually cost |
| **SPI** (Schedule Performance Index) | EV / PV | >1 = ahead, <1 = behind |
| **CPI** (Cost Performance Index) | EV / AC | >1 = under budget, <1 = over |
| **EAC** (Estimate at Completion) | BAC / CPI | Projected total cost |
| **ETC** (Estimate to Complete) | EAC - AC | Remaining cost |
| **VAC** (Variance at Completion) | BAC - EAC | Projected budget variance |

## MEETING MANAGEMENT

### Effective Meeting Protocol
- **Before**: agenda with time-boxed items, pre-reads shared 24h ahead
- **During**: designated note-taker, parking lot for off-topic items, action items with owner + deadline
- **After**: minutes distributed within 24h, action items tracked in shared tool
- **Decision log**: date, decision, rationale, who decided, reversible?

## CHANGE MANAGEMENT

### Change Request Process
1. Submit CR with justification, scope/schedule/cost impact
2. Impact assessment by PM + technical lead
3. CCB review: approve / reject / defer
4. If approved: update baseline, communicate, re-plan
5. Track implementation and verify closure

### Scope Creep Prevention
- Baseline scope document signed by sponsor
- All changes through formal CR process
- "Parking lot" for nice-to-haves (evaluate post-delivery)
- Regular backlog grooming to reprioritize`,
}
