export const HOOK_NAME = "task-edit-guard"

export const BLOCKED_PATTERNS: RegExp[] = [
  /sed\s+.*\.matrixx\/plans/,
  /sed\s+.*\.matrixx\/tasks/,
  /python3?\s+.*\.matrixx\/plans/,
  /python3?\s+.*\.matrixx\/tasks/,
  /echo\s+.*\.matrixx\/plans/,
  /echo\s+.*\.matrixx\/tasks/,
  /cat\s*>.*\.matrixx\/plans/,
  /cat\s*>.*\.matrixx\/tasks/,
  /mv\s+.*\.matrixx\/plans/,
  /mv\s+.*\.matrixx\/tasks/,
  /rm\s+.*\.matrixx\/tasks\/T-.*\.json/,
  /printf\s+.*\.matrixx\/plans/,
  /printf\s+.*\.matrixx\/tasks/,
]
