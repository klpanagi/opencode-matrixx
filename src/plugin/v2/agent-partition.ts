/**
 * Wave 9.1 — measurement seam for how the V2 agent editor treats an id the
 * runtime has not resolved.
 *
 * CORRECTION (agents-on-v2): the original note here claimed the editor could
 * only refine, never introduce. That was refuted against a real V2 host. The
 * `AgentEditor` surface (`@opencode/plugin@2.0.16`,
 * `dist/promise/agent.d.ts` lines 2-8) indeed declares no `add`, but `update`
 * is the introducing call — `@opencode/core`
 * `dist/chunks/event-logger-wsb64f9g.js` lines 53-58 seeds
 * `Agent.Info.default(id)` and inserts it into the registry when the id is
 * absent. `registerV2Components` therefore calls `update` for EVERY agent.
 *
 * `unresolvable` is retained as the accurate name for what the partition
 * actually measures — "the runtime had not pre-resolved this id" — and no
 * longer implies the agent cannot be introduced.
 */

export type V2AgentFields = Record<string, unknown>

/**
 * Read-only slice of the V2 agent editor. Return type is intentionally
 * `unknown`: only truthiness is used, so the branded string types on
 * `Agent.Info.id` / `Agent.Info.name` do not leak into this signature.
 */
export type V2AgentLookup = {
  get(id: string): unknown
}

export type V2AgentPartition<TFields> = {
  /** Ids the runtime had already resolved, so `update` refines them. */
  refined: Array<[id: string, fields: TFields]>
  /**
   * Ids the runtime had not pre-resolved. `update` INTRODUCES these from
   * `Agent.Info.default(id)`.
   */
  unresolvable: Array<[id: string, fields: TFields]>
  /** Every input id, in order — the set that must reach the editor. */
  all: Array<[id: string, fields: TFields]>
}

export function partitionAgentsForV2<TFields extends V2AgentFields>(
  agents: Iterable<[string, TFields]>,
  editor: V2AgentLookup,
): V2AgentPartition<TFields> {
  const refined: Array<[id: string, fields: TFields]> = []
  const unresolvable: Array<[id: string, fields: TFields]> = []
  const all: Array<[id: string, fields: TFields]> = []

  for (const [id, fields] of agents) {
    all.push([id, fields])
    if (editor.get(id)) {
      refined.push([id, fields])
    } else {
      unresolvable.push([id, fields])
    }
  }

  return { refined, unresolvable, all }
}
