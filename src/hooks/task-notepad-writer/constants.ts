export const HOOK_NAME = "task-notepad-writer"

export const MATRIXX_DIR_NAME = ".matrixx"
export const PLANS_SUBDIR = "plans"
export const NOTEPADS_SUBDIR = "notepads"
export const PLAN_EXTENSION = ".md"
export const NOTEPAD_EXTENSION = ".md"

export const ADHOC_BUCKET = "adhoc"

export const TASK_CREATE_TOOL = "task_create"
export const TASK_UPDATE_TOOL = "task_update"

export const COMPLETED_STATUS = "completed"
export const DEFAULT_PRIORITY = "medium"
export const COMPLETION_SECTION_TITLE = "## Completion"

export const PLAN_NAME_METADATA_KEY = "planName"

export const SLUG_MAX_LENGTH = 60

export const NOTEPAD_SECTIONS = [
  {
    heading: "## Findings",
    body: "(Record what you learn about this code as you work — patterns, conventions, gotchas, useful references.)",
  },
  {
    heading: "## Blockers",
    body: "(Anything blocking progress. Be specific: file path, line, error, workaround if any.)",
  },
  {
    heading: "## Questions",
    body: "(Open questions to revisit later. Don't lose them when context compacts.)",
  },
  {
    heading: "## Results",
    body: "(Summary on completion. What changed, what was verified, what remains.)",
  },
] as const

/**
 * The header's `**Task ID**: <id>` line is the durable idempotency marker: it
 * lives inside the file, so a lookup finds the same notepad across process
 * restarts, with no in-memory bookkeeping to lose.
 */
export function taskIdMarkerLine(taskId: string): string {
  return `**Task ID**: ${taskId}`
}

export function taskIdMarkerPresent(content: string, taskId: string): boolean {
  return content.split("\n").some((line) => line.trim() === taskIdMarkerLine(taskId))
}

export function renderNotepad(input: {
  subject: string
  taskId: string
  priority?: string | undefined
  status?: string | undefined
  startedAt: string
}): string {
  const header = [
    `# Task: ${input.subject}`,
    "",
    taskIdMarkerLine(input.taskId),
    `**Priority**: ${input.priority ?? DEFAULT_PRIORITY}`,
    `**Status**: ${input.status ?? "pending"}`,
    `**Started**: ${input.startedAt}`,
  ].join("\n")

  const sections = NOTEPAD_SECTIONS.map((section) => `${section.heading}\n\n${section.body}`).join("\n\n")

  return `${header}\n\n${sections}\n`
}

export function renderCompletionStamp(completedAt: string): string {
  return `\n${COMPLETION_SECTION_TITLE}\n- completed_at: ${completedAt}\n- status: ${COMPLETED_STATUS}\n`
}
