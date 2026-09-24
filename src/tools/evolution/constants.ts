/**
 * evolution tool — description string and shared constants.
 *
 * The tool description is referenced by the tool factory and included in the
 * LLM-facing tool schema, so keep it factual, concise, and triggerable.
 */

/** Tool description — governance plus read-only retrieval actions. */
export const EVOLUTION_DESCRIPTION =
  "Govern self-evolution proposals staged in .matrixx/evolution/pending, and retrieve approved knowledge. Actions: 'list' (show pending proposals with version and confidence), 'get' (show a staged proposal), 'approve' (promote a pending skill and record the audit entry), 'reject' (discard a pending proposal), 'status' (state totals, pending count, and audit tail), 'search' (read-only scoped search over approved knowledge), 'get_context' (read-only scoped context, truncated at a char cap). Use this tool instead of shell commands for all evolution state.";

/** Allowlisted actions: Wave1 governance plus read-only retrieval queries. */
export const EVOLUTION_TOOL_ACTIONS = [
  "list",
  "get",
  "approve",
  "reject",
  "status",
  "search",
  "get_context",
] as const;

/** The read-only retrieval surface — no action here may mutate evolution state. */
export const EVOLUTION_QUERY_ACTIONS = ["search", "get_context"] as const;

/** How many audit lines `status` reports. */
export const AUDIT_TAIL_LIMIT = 20;

/** Hard char cap for `get_context` output; cut text gets a truncation marker. */
export const GET_CONTEXT_CHAR_CAP = 4000;

/** Max records `search` reports. */
export const SEARCH_RESULT_LIMIT = 20;

/** Message when the scoped query finds nothing. */
export const NO_RETRIEVABLE_MESSAGE = "No retrievable knowledge for this scope.";

/** Slugs must stay inside the pending dir — no separators, no traversal. */
export const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Message when nothing is staged. */
export const NO_PENDING_MESSAGE = "No pending evolution proposals.";
