export interface ContextModeToolGuidance {
  searchGuidance: string
  readGuidance: string
  analysisGuidance: string
}

const ENFORCED_GUIDANCE: ContextModeToolGuidance = {
  searchGuidance:
    "Use ctx_search for indexed KB hits -> ctx_batch_execute / ctx_execute for multi-file analysis. NEVER use grep/glob (blocked).",
  readGuidance: "Use ctx_execute_file for file analysis. read tool may produce warnings.",
  analysisGuidance:
    "Use ctx_execute / ctx_execute_file for computation. NEVER use bash cat/head/tail/grep for analysis.",
}

const LEGACY_GUIDANCE: ContextModeToolGuidance = {
  searchGuidance:
    "grep / glob available for text and file patterns. ctx_search for indexed KB hits when context-mode is active.",
  readGuidance: "read tool available for file inspection; ctx_execute_file optional for large files.",
  analysisGuidance:
    "bash cat/head/tail/grep permitted for analysis, though ctx_execute / ctx_execute_file recommended for large outputs.",
}

/**
 * Returns context-mode-aware tool guidance for subagent prompts.
 * When `enforce` is true, raw grep/glob/read/bash-cat are blocked by the
 * context-mode-enforcer hook, so guidance routes to ctx_* tools instead.
 * When `enforce` is false, legacy tool guidance is preserved.
 */
export function getContextModeToolGuidance(enforce: boolean): ContextModeToolGuidance {
  return enforce ? ENFORCED_GUIDANCE : LEGACY_GUIDANCE
}