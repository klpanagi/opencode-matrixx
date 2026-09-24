/**
 * evolution tool — description string and shared constants.
 *
 * The tool description is referenced by the tool factory and included in the
 * LLM-facing tool schema, so keep it factual, concise, and triggerable.
 */

/** Tool description — covers the Wave1 governance actions. */
export const EVOLUTION_DESCRIPTION =
  "Govern self-evolution proposals staged in .matrixx/evolution/pending. Actions: 'list' (show pending proposals with version and confidence), 'get' (show a staged proposal), 'approve' (promote a pending skill and record the audit entry), 'reject' (discard a pending proposal), 'status' (state totals, pending count, and audit tail). Use this tool instead of shell commands for all evolution state. The 'search' and 'query-context' actions are reserved for future read-only retrieval.";

/** Allowlisted actions: Wave1 governance plus reserved T9 query stubs. */
export const EVOLUTION_TOOL_ACTIONS = [
  "list",
  "get",
  "approve",
  "reject",
  "status",
  "search",
  "query-context",
] as const;

/** How many audit lines `status` reports. */
export const AUDIT_TAIL_LIMIT = 20;

/** Slugs must stay inside the pending dir — no separators, no traversal. */
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Message when nothing is staged. */
export const NO_PENDING_MESSAGE = "No pending evolution proposals.";
