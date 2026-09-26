/**
 * Wave 9.1 — measurement seam for the V2 agent registration constraint.
 *
 * The V2 `AgentEditor` surface (`@opencode/plugin@2.0.16`,
 * `dist/promise/agent.d.ts` lines 2-8) declares only `list`, `get`, `default`,
 * `update` and `remove`. There is no `add`, so a V2 plugin cannot INTRODUCE an
 * agent — it can only REFINE one the runtime has already resolved.
 *
 * This module turns that constraint into a value the registrar can log and a
 * test can assert, instead of a silent `continue`.
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
  /** Agents the runtime already resolved, and which we can therefore refine. */
  refined: Array<[id: string, fields: TFields]>
  /**
   * Agents Matrixx defines that the runtime did not resolve. These CANNOT be
   * registered on V2 by any plugin-supported path; they require the V1 config
   * hook to remain the introducing mechanism.
   */
  unresolvable: Array<[id: string, fields: TFields]>
}

export function partitionAgentsForV2<TFields extends V2AgentFields>(
  agents: Iterable<[string, TFields]>,
  editor: V2AgentLookup,
): V2AgentPartition<TFields> {
  const refined: Array<[string, TFields]> = []
  const unresolvable: Array<[string, TFields]> = []

  for (const [id, fields] of agents) {
    if (editor.get(id)) {
      refined.push([id, fields])
    } else {
      unresolvable.push([id, fields])
    }
  }

  return { refined, unresolvable }
}
