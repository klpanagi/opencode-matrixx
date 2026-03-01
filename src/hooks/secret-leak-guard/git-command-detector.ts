const GIT_COMMIT_PATTERN = /\bgit\s+(commit|push)\b/
const GIT_ADD_COMMIT_CHAIN = /\bgit\s+add\b.*&&.*\bgit\s+commit\b/

export function isGitCommitOrPush(command: string): boolean {
  return GIT_COMMIT_PATTERN.test(command) || GIT_ADD_COMMIT_CHAIN.test(command)
}

export function isGitPush(command: string): boolean {
  return /\bgit\s+push\b/.test(command)
}
