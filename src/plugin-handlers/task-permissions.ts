/**
 * Task-store permission grants.
 *
 * The task store (`.matrixx/tasks/`) is a separate write channel from the
 * codebase. An agent whose prompt tells it to track work with tasks must be
 * able to reach it, no matter which agent happens to hold delegation rights.
 */

/** The legacy todo tools are denied for every task-capable agent. */
export const denyTodoTools = { todowrite: "deny", todoread: "deny" } as const

/**
 * Tracking only: the agent may read and write its own task-store records but
 * may not delegate. Granted to every primary-capable agent.
 */
export const taskStorePermissions = { "task_*": "allow", ...denyTodoTools } as const

/** Tracking plus outgoing delegation via the task tool. */
export const fullTaskPermissions = {
  task: "allow",
  "task_*": "allow",
  teammate: "allow",
  ...denyTodoTools,
} as const

type AgentLike = { mode?: string; permission?: Record<string, unknown> }

/**
 * An agent that can be driven as a top-level session is expected to track its
 * own work in the task store. Derived from the declared mode, never from a
 * hardcoded name list — a name list is exactly what let the original drift go
 * unnoticed.
 */
export function isTaskStorePrimary(agent: AgentLike): boolean {
  return agent.mode === "primary" || agent.mode === "all"
}

/**
 * Agents that restrict `task` themselves (Sentinel, a read-only auditor) keep
 * that denial: the fill-only grant below never overwrites a declared value.
 * Everything else that is primary-capable delegates as well.
 *
 * Sentinel justification: its read-only mandate covers FILES. The task store
 * is not a source file — it is how a read-only auditor hands findings off to
 * an implementer without being able to touch the code itself.
 */
function canDelegate(agent: AgentLike): boolean {
  return agent.permission?.task !== "deny"
}

/** The permission defaults a primary-capable agent is missing. */
export function deriveTaskPermissions(agent: AgentLike): Record<string, string> {
  if (!isTaskStorePrimary(agent)) return {}
  return canDelegate(agent) ? { ...fullTaskPermissions } : { ...taskStorePermissions }
}

/**
 * Fill-only merge (the architect arm's `??=` pattern): a factory value or an
 * explicit user override in their own config is never overwritten here.
 */
export function grantTaskPermissions(agent: AgentLike): void {
  const permission = (agent.permission ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(deriveTaskPermissions(agent))) {
    permission[key] ??= value;
  }
  agent.permission = permission;
}
