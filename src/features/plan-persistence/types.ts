/**
 * Plan Persistence Types
 */

/** Machine-parseable metadata appended as HTML comment to plan files */
export interface PlanMeta {
  /** Plan file name without .md extension */
  id: string
  /** ISO timestamp of last write */
  updatedAt: string
  /** Session ID that triggered the last write */
  sessionId: string
  /** Total todo count at time of write */
  todoTotal: number
  /** Completed todo count at time of write */
  todoCompleted: number
  /** Git HEAD at time of write (optional) */
  gitHead?: { sha: string; branch?: string }
}

/** Events the plan-persister hook listens to */
export type PlanPersistEvent =
  | { type: "session.idle"; sessionID: string }
  | { type: "session.compacted"; sessionID: string }

/** Return value of buildRehydrationContext */
export interface RehydrationContext {
  planName: string
  planPath: string
  content: string
  progress: { total: number; completed: number }
  directive: string
}

/** Options for the plan-persister hook */
export interface PlanPersistenceOptions {
  /** Project root directory */
  directory: string
}
