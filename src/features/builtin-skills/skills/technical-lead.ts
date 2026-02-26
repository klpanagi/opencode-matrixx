import type { BuiltinSkill } from "../types"

export const TECHNICAL_LEAD_SKILL_NAME = "technical-lead"

export const TECHNICAL_LEAD_SKILL_DESCRIPTION =
  "Technical leadership expertise: architecture decision records (ADRs), code review strategy, tech debt management, system design, team mentoring, technical roadmaps, incident management, build/release engineering. Triggers: 'tech lead', 'architecture decision', 'ADR', 'tech debt', 'code review', 'system design', 'technical roadmap'."

export const technicalLeadSkill: BuiltinSkill = {
  name: TECHNICAL_LEAD_SKILL_NAME,
  description: TECHNICAL_LEAD_SKILL_DESCRIPTION,
  template: `# Technical Lead — Comprehensive Reference

## ARCHITECTURE DECISIONS

### Architecture Decision Records (ADRs)
**Template:**
\`\`\`
# ADR-NNN: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN
**Date:** YYYY-MM-DD
**Deciders:** [list of people involved]

## Context
What is the issue we are facing? What forces are at play?

## Decision
What is the change we are making?

## Consequences
### Positive
- [benefit 1]

### Negative
- [tradeoff 1]

### Neutral
- [observation 1]

## Alternatives Considered
### Option A: [name]
- Pros: ...
- Cons: ...

### Option B: [name]
- Pros: ...
- Cons: ...
\`\`\`

### Decision-Making Framework
| Factor | Weight | How to Evaluate |
|--------|--------|-----------------|
| **Team capability** | High | Can the team build & maintain this? |
| **Time-to-market** | High | Does it meet delivery constraints? |
| **Operational cost** | Medium | Total cost of ownership (build + run + maintain) |
| **Reversibility** | Medium | How hard is it to change later? (prefer reversible decisions) |
| **Ecosystem maturity** | Medium | Community support, documentation, hiring pool |
| **Security posture** | High | Attack surface, compliance requirements |

### Architecture Review Checklist
- [ ] Scalability: horizontal scaling path identified
- [ ] Reliability: failure modes enumerated, SLOs defined
- [ ] Security: threat model documented, auth/authz design
- [ ] Observability: logging, metrics, tracing strategy
- [ ] Data: consistency model, backup/recovery, retention policy
- [ ] Integration: API contracts, versioning strategy
- [ ] Deployment: zero-downtime strategy, rollback plan

## CODE REVIEW STRATEGY

### Review Priorities (in order)
1. **Correctness**: does it do what it claims?
2. **Security**: injection, auth bypass, data exposure
3. **Architecture**: does it fit the system design? right abstraction level?
4. **Performance**: obvious bottlenecks, N+1 queries, memory leaks
5. **Maintainability**: readability, naming, test coverage
6. **Style**: formatting, conventions (lowest priority — automate with linters)

### Review Feedback Tiers
| Prefix | Meaning | Action Required |
|--------|---------|-----------------|
| **blocker:** | Must fix before merge | Yes — PR cannot merge |
| **concern:** | Significant issue, discuss | Yes — resolve in comments |
| **suggestion:** | Improvement idea | Optional — author decides |
| **nit:** | Style/cosmetic | Optional — batch fix later |
| **question:** | Seeking understanding | Respond in comments |
| **praise:** | Highlight good work | None — positive reinforcement |

### Review Anti-Patterns to Avoid
- Rubber-stamping (approving without reading)
- Bikeshedding (debating trivial style over substance)
- Gatekeeping (blocking for personal preference, not quality)
- Drive-by reviews (commenting without understanding context)
- Ghost reviews (requesting changes, then going silent)

## TECH DEBT MANAGEMENT

### Tech Debt Classification
| Type | Description | Example |
|------|-------------|---------|
| **Deliberate-Prudent** | "We know but ship now, fix later" | Skip tests for deadline, scheduled cleanup |
| **Deliberate-Reckless** | "We don't care" | No error handling, copy-paste code |
| **Inadvertent-Prudent** | "Now we know a better way" | Learned better pattern after shipping |
| **Inadvertent-Reckless** | "What's a design pattern?" | Spaghetti code from inexperience |

### Tech Debt Tracking
- Tag in issue tracker: \`tech-debt\`, severity (critical/high/medium/low)
- Include: what is wrong, why it matters, estimated effort, blast radius
- Budget: allocate 15-20% of sprint capacity for debt reduction
- Prioritize by: frequency of pain × blast radius × effort to fix

### Tech Debt Paydown Strategies
- **Boy Scout Rule**: leave code cleaner than you found it (incremental)
- **Dedicated sprints**: 1 in every 4-6 sprints focused on debt
- **Strangler Fig**: gradually replace legacy modules behind an interface
- **Golden Path**: define the right way, migrate new code first, backfill
- **Refactoring tickets**: pair debt reduction with feature work in same area

## SYSTEM DESIGN

### Design Document Template
1. **Overview**: 1-paragraph problem statement + proposed solution
2. **Goals / Non-Goals**: explicit scope boundaries
3. **Background**: relevant context, existing systems, prior art
4. **Design**: detailed technical approach
   - Data model / schema changes
   - API design (endpoints, contracts)
   - Component interaction (sequence diagrams)
   - Error handling & edge cases
5. **Alternatives Considered**: with tradeoff analysis
6. **Security & Privacy**: threat model, data handling
7. **Observability**: metrics, alerts, dashboards
8. **Rollout Plan**: feature flags, canary, rollback
9. **Open Questions**: unresolved decisions

### Capacity Estimation Quick Reference
| Resource | Rule of Thumb |
|----------|--------------|
| **QPS** | peak = 3-5× average; design for peak |
| **Storage** | calculate per-record × growth rate × retention |
| **Memory** | working set × safety factor (2-3×) |
| **Bandwidth** | payload size × QPS × overhead (headers, TLS) |
| **Latency budget** | allocate per hop: DB (5-50ms), cache (<1ms), network (1-10ms), compute (varies) |

## TECHNICAL ROADMAP

### Roadmap Structure
| Horizon | Timeframe | Confidence | Content |
|---------|-----------|------------|---------|
| **Now** | 0-3 months | High (>80%) | Committed features, specific tickets |
| **Next** | 3-6 months | Medium (50-80%) | Planned themes, rough scope |
| **Later** | 6-12 months | Low (<50%) | Strategic direction, exploratory |

### Platform Health Metrics
- **Deployment frequency**: how often code ships to production
- **Lead time for changes**: commit → production
- **Change failure rate**: % of deployments causing incidents
- **Mean time to recovery (MTTR)**: incident detection → resolution
- **Test coverage**: line/branch coverage trends
- **Dependency freshness**: % of deps within 1 major version

## INCIDENT MANAGEMENT

### Severity Levels
| Level | Impact | Response Time | Example |
|-------|--------|---------------|---------|
| **SEV-1** | Complete outage / data loss | Immediate (15 min) | Production down, data breach |
| **SEV-2** | Major feature degraded | < 1 hour | Payment processing failing |
| **SEV-3** | Minor feature broken | < 4 hours | Search results incorrect |
| **SEV-4** | Cosmetic / low impact | Next business day | UI misalignment |

### Incident Response Flow
1. **Detect**: monitoring alert or user report
2. **Triage**: assign severity, identify incident commander
3. **Communicate**: status page update, stakeholder notification
4. **Investigate**: gather data, form hypothesis, test
5. **Mitigate**: apply fix or workaround, verify resolution
6. **Resolve**: confirm stability, close incident
7. **Post-mortem**: blameless review within 48 hours

### Post-Mortem Template
- **Incident Summary**: what happened, duration, impact
- **Timeline**: minute-by-minute chronology
- **Root Cause**: 5-Whys or Fishbone analysis
- **Contributing Factors**: what made it worse
- **Action Items**: preventive measures with owner + deadline
- **Lessons Learned**: what went well, what to improve

## TEAM & MENTORING

### 1:1 Meeting Structure
- **Check-in** (5 min): how are you doing? blockers?
- **Their agenda** (15 min): topics they want to discuss
- **Your agenda** (10 min): feedback, career growth, alignment
- **Action items** (5 min): commitments from both sides

### Growth Framework Signals
| Level | Technical | Leadership | Impact |
|-------|-----------|------------|--------|
| **Junior** | Completes defined tasks | Asks for help appropriately | Individual task level |
| **Mid** | Designs solutions, owns features | Mentors juniors, reviews code | Feature level |
| **Senior** | System design, cross-team collaboration | Leads projects, sets standards | Multi-team level |
| **Staff** | Architecture decisions, technical vision | Influences org-wide practices | Organization level |
| **Principal** | Industry-level innovation | Shapes company technical strategy | Company / industry level |

### Delegation Framework
- **Tell**: do exactly this (new joiners, urgent situations)
- **Sell**: here's what I'd like and why (building buy-in)
- **Consult**: what do you think? (growing autonomy)
- **Delegate**: you own this, update me on progress (experienced engineers)`,
}
