import { CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS } from "../../shared/context-mode-enforcement"

export const HOOK_NAME = "context-mode-enforcer"

export const WARN_MESSAGE_READ =
  "Use ctx_execute_file to analyze, summarize, or extract from a file — raw reads bypass the FTS5 sandbox and pollute context. " +
  "Read is CORRECT when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against; hashline IDs for Edit on non-plan paths, .matrixx/plans/*.md must use plan_read/plan_update). " +
  "For indexed-KB recall use ctx_search."

export const BLOCK_MESSAGE_GREP_GLOB =
  "Blocked: raw grep/glob is forbidden when context-mode is enforced. " +
  "Use ctx_search for indexed-KB hits, or ctx_batch_execute / ctx_execute running shell `rg` for codebase search. " +
  "Raw grep/glob bypasses the FTS5 sandbox and pollutes context."

export const WARN_MESSAGE_BASH_READ =
  "Use ctx_batch_execute / ctx_execute to PROCESS command output (filter, count, aggregate, parse, transform) instead of `cat`/`head`/`tail`/`grep` via bash — raw bash file reads bypass the sandbox. " +
  "Shell is CORRECT when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you MUTATE state (git, mkdir, rm, mv, navigation)."

export const WEBFETCH_BLOCK_MESSAGE =
  "Blocked: raw WebFetch is forbidden when context-mode is enforced. " +
  "Use ctx_fetch_and_index — full network access, results indexed for ctx_search, raw page bytes never enter your conversation."

export const BASH_ROUTED_MESSAGE =
  "Blocked: this shell command is analysis work, which belongs in the context-mode sandbox. " +
  "Use ctx_batch_execute (multi-command, auto-indexed) or ctx_execute (single derivation) instead. " +
  "Shell stays correct for OBSERVE (git status, whoami, pwd) and MUTATE (git, mkdir, rm, mv, navigation)."

export const DEFAULT_BLOCKED_TOOLS: typeof CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS = CONTEXT_MODE_DEFAULT_BLOCKED_TOOLS
export const WARN_ONLY_TOOLS = ["read"] as const
