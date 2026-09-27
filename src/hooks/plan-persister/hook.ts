/**
 * Plan Persister Hook
 *
 * Continuation hook that persists active plan state (todos + metadata)
 * to the plan file on session.idle, and builds rehydration context
 * for injection after compaction.
 */

import { existsSync } from "node:fs"
import type { PluginInput } from "@opencode-ai/plugin"
import { readMissionState } from "../../features/mission-state"
import { buildRehydrationContext } from "../../features/mission-state/rehydrate"
import type { PlanPersistenceOptions } from "../../features/mission-state/types"
import { log } from "../../shared/logger"
import { collectLinkedTodos } from "./task-link"
import { applyFilteredSync } from "./task-sync"

const HOOK_NAME = "plan-persister"

export interface PlanPersister {
  buildRehydrationContext: (sessionID: string) => string | null
  capture: (sessionID: string) => Promise<void>
  event: (input: { event: { type: string; properties?: unknown } }) => Promise<void>
}

export function createPlanPersister(
  _ctx: PluginInput,
  options: PlanPersistenceOptions,
): PlanPersister {
  const { directory } = options

  const capture = async (sessionID: string): Promise<void> => {
    if (!sessionID) return

    const mission = readMissionState(directory)
    if (!mission?.active_plan) return

    // Only capture for sessions that are part of this mission
    if (!mission.session_ids?.includes(sessionID)) return

    const planPath = mission.active_plan
    if (!existsSync(planPath)) return

    // Filtered pipeline: strict task read + mission linkage only.
    // Foreign sessions never vote; drifted files log as unknown.
    const { todos } = collectLinkedTodos(directory, mission)

    // Mandatory early return. `applyFilteredSync` has no zero-vote guard, so an
    // empty list would reach `atomicWrite` and uncheck plan boxes. Syncing is
    // therefore skipped — and logged — whenever no mission-linked task votes.
    if (todos.length === 0) {
      log(`[${HOOK_NAME}] Sync skipped: no mission-linked tasks for this session`, {
        sessionID,
        plan: planPath,
      })
      return
    }

    await applyFilteredSync({
      directory,
      mission,
      planPath,
      todos,
      actorSessionId: sessionID,
    })
  }

  const event = async ({ event: evt }: { event: { type: string; properties?: unknown } }): Promise<void> => {
    const props = evt.properties as Record<string, unknown> | undefined

    if (evt.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return
      await capture(sessionID)
      return
    }

    if (evt.type === "session.compacted") {
      const sessionID = (props?.sessionID ?? (props?.info as { id?: string } | undefined)?.id) as string | undefined
      if (!sessionID) return
      // On compaction, capture latest state before it's lost
      await capture(sessionID)
      return
    }
  }

  const buildRehydrationCtx = (_sessionID: string): string | null => {
    const ctx = buildRehydrationContext(directory)
    return ctx?.directive ?? null
  }

  return { capture, event, buildRehydrationContext: buildRehydrationCtx }
}
