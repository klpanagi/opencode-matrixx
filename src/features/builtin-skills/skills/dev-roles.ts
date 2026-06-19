export interface DevRolePreset {
  name: string
  description: string
  category?: string
  subagentType?: string
  skills: string[]
}

export const DEV_ROLE_PRESETS: Record<string, DevRolePreset> = {
  developer: {
    name: "Developer",
    description: "Writes implementation code following TDD",
    category: "source",
    skills: ["git-master", "tdd-enforcer"],
  },
  tester: {
    name: "Tester",
    description: "Writes and runs tests, verifies coverage",
    category: "source",
    skills: ["tdd-enforcer", "quality-gate"],
  },
  quality: {
    name: "Quality Evaluator",
    description: "Lint, typecheck, code review",
    category: "red-pill",
    skills: ["quality-gate", "review-work"],
  },
  security: {
    name: "Security Expert",
    description: "Security audit and vulnerability scanning",
    subagentType: "sentinel",
    skills: ["security-core", "security-sast", "security-api", "security-dependencies"],
  },
  architect: {
    name: "Architect",
    description: "System design and architecture decisions",
    subagentType: "oracle",
    skills: [],
  },
}

export interface DevPhase {
  name: string
  description: string
  role: string
  exitCriteria: string[]
  skipForSmallTasks?: boolean
}

export const DEV_PIPELINE: DevPhase[] = [
  {
    name: "PLAN",
    description: "Design decisions, task breakdown, file list",
    role: "architect",
    exitCriteria: [
      "Clear implementation approach defined",
      "File list with responsibilities identified",
      "Edge cases and constraints documented",
    ],
    skipForSmallTasks: true,
  },
  {
    name: "BUILD",
    description: "Implement code with TDD (RED-GREEN-REFACTOR)",
    role: "developer",
    exitCriteria: [
      "All implementation code written",
      "Failing tests written first (RED)",
      "Minimum code to pass tests (GREEN)",
      "bun test passes with 0 failures",
    ],
  },
  {
    name: "VERIFY",
    description: "Lint, typecheck, test execution, build",
    role: "quality",
    exitCriteria: [
      "bun run lint — 0 issues",
      "bun run typecheck — no errors",
      "bun test — all passed",
      "bun run build — success",
    ],
  },
  {
    name: "REVIEW",
    description: "5-agent parallel code review",
    role: "quality",
    exitCriteria: [
      "All 5 review agents PASS",
      "No CRITICAL or MAJOR blocking issues",
    ],
    skipForSmallTasks: true,
  },
  {
    name: "SECURE",
    description: "Security audit and vulnerability scan",
    role: "security",
    exitCriteria: [
      "No CRITICAL security findings",
      "No HIGH security findings",
      "Dependencies checked for CVEs",
    ],
    skipForSmallTasks: true,
  },
  {
    name: "SHIP",
    description: "Atomic commits and PR creation",
    role: "developer",
    exitCriteria: [
      "Clean atomic commits",
      "PR created targeting dev branch",
      "All CI checks pass",
    ],
  },
]
