import type { EVOLUTION_TOOL_ACTIONS } from "./constants";

/** Allowlisted actions for the `evolution` tool. */
export type EvolutionToolAction = (typeof EVOLUTION_TOOL_ACTIONS)[number];

/** Flat args shape for the multi-action `evolution` tool. */
export type EvolutionToolArgs = {
  action: EvolutionToolAction;
  slug?: string;
  global?: boolean;
};

/** Pending proposal summary shown by the `list` action. */
export type PendingProposalSummary = {
  slug: string;
  version: string | null;
  confidence: number | null;
};
