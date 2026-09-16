

import type { PluginInput } from "@opencode-ai/plugin"
import type { BackgroundTaskConfig, DcpHandoffCompression, TmuxConfig } from "../../config/schema"
import { getAgentToolRestrictions, log, normalizeSDKResponse, promptWithModelSuggestionRetry } from "../../shared"
import { hasPendingQuestionMessage } from "../../shared/awaiting-user"
import { formatDuration } from "../../shared/format-duration"
import { setSessionTemperature, setSessionTools } from "../../shared/session-state"
import { isInsideTmux } from "../../shared/tmux"
import { formatWallclockTimeout } from "../../shared/wallclock-outcome"
import { registerSubagentSession, subagentSessions, unregisterSubagentSession } from "../session-state"
import { getTaskToastManager } from "../task-toast-manager"
import { classifyAdmission } from "./admission"
import { ConcurrencyManager } from "./concurrency"
import {
  DEFAULT_ADMISSION_TIMEOUT_MS,
  DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
  DEFAULT_NESTED_ADMISSION_ENABLED,
  DEFAULT_NESTED_ADMISSION_MODE,
  DEFAULT_NESTED_MAX_DEPTH,
  DEFAULT_STALE_TIMEOUT_MS,
  DEFAULT_WALL_CLOCK_ABORT_GRACE_MS,
  DEFAULT_WALL_CLOCK_TIMEOUT_MS,
  MIN_IDLE_TIME_MS,
  MIN_RUNTIME_BEFORE_STALE_MS,
  POLLING_INTERVAL_MS,
  PRUNE_THROTTLE_MS,
  TASK_CLEANUP_DELAY_MS,
  TASK_TTL_MS,
} from "./constants"
import {
  getSessionErrorMessage,
  isAbortedSessionError,
  } from "./error-helpers"
import { type BgHandle, readHandles, sweepStaleHandles, writeHandle } from "./handle-index"
import {
  type CircuitBreakerSettings,
  detectRepetitiveToolUse,
  recordToolCall,
  resolveCircuitBreakerSettings,
} from "./loop-detector"
import { buildCompletionNotification, resolveAgentAndModel } from "./notification-builder"
import { type ReconcileOutcome, reconcileHandle } from "./reconcile"
import { classifyRevivable, findRevivableHandle, type ReviveBlockReason, toReviveTask } from "./revive"
import { validateSessionHasOutput as validateSessionOutput } from "./session-output"
import { TaskHistory } from "./task-history"
import type {
  BackgroundTask,
  BackgroundTerminalReason,
  LaunchInput,
  ResumeInput,
  ReviveInput,
} from "./types"
import { resolveWakeIntervalMs, shouldWakeForParent, WAKE_REMINDER_TEXT, WakeScheduler } from "./wake-scheduler"
import { WallclockSupervisor } from "./wallclock"

type ProcessCleanupEvent = NodeJS.Signals | "beforeExit" | "exit"

type OpencodeClient = PluginInput["client"]

/**
 * Bounded wait for a nested admit to grab the reserved slot in "reserve" mode.
 * A nested admit must never await the semaphore unboundedly — if the reserved
 * slot is not free within this window it falls back to bypass overflow.
 */
const NESTED_RESERVE_ATTEMPT_TIMEOUT_MS = 100


interface MessagePartInfo {
  sessionID?: string
  type?: string
  tool?: string
  id?: string
  state?: { status?: string; input?: Record<string, unknown> }
}

export interface EventProperties {
  sessionID?: string
  info?: { id?: string }
  [key: string]: unknown
}

interface Event {
  type: string
  properties?: EventProperties
}

interface Todo {
  content: string
  status: string
  priority: string
  id: string
}

interface QueueItem {
  task: BackgroundTask
  input: LaunchInput
}

export interface SubagentSessionCreatedEvent {
  sessionID: string
  parentID: string
  title: string
}

export type OnSubagentSessionCreated = (event: SubagentSessionCreatedEvent) => Promise<void>

/**
 * Rebuild a minimal in-memory task from a persisted handle. The persisted
 * status is carried verbatim and `sessionID`/`terminalReason` are preserved so
 * `restoreHandles()` can reconcile in-flight handles against the live host.
 * No `concurrencyKey` is restored: a slot is never re-acquired (C7).
 */
function restoreTaskFromHandle(handle: BgHandle): BackgroundTask {
  return {
    id: handle.taskId,
    parentSessionID: handle.parentSessionID,
    parentMessageID: handle.parentMessageID,
    description: handle.description,
    prompt: "",
    agent: handle.agent,
    status: handle.status,
    sessionID: handle.sessionID,
    terminalReason: handle.terminalReason,
    queuedAt: handle.queuedAt !== undefined ? new Date(handle.queuedAt) : undefined,
    startedAt: handle.startedAt !== undefined ? new Date(handle.startedAt) : undefined,
    completedAt: handle.completedAt !== undefined ? new Date(handle.completedAt) : undefined,
    model: handle.model,
    category: handle.category,
    concurrencyGroup: handle.concurrencyGroup,
  }
}

export class BackgroundManager {
  private static cleanupManagers = new Set<BackgroundManager>()
  private static cleanupRegistered = false
  private static cleanupHandlers = new Map<ProcessCleanupEvent, () => void>()

  private tasks: Map<string, BackgroundTask>
  private notifications: Map<string, BackgroundTask[]>
  private pendingByParent: Map<string, Set<string>>  // Track pending tasks per parent for batching
  private client: OpencodeClient
  private directory: string
  private pollingInterval?: ReturnType<typeof setInterval>
  private pollingInFlight = false
  private lastPruneAt = 0
  private concurrencyManager: ConcurrencyManager
  private shutdownTriggered = false
  private config?: BackgroundTaskConfig
  private tmuxEnabled: boolean
  private onSubagentSessionCreated?: OnSubagentSessionCreated
  private onShutdown?: () => void

  private queuesByKey: Map<string, QueueItem[]> = new Map()
  private processingKeys: Set<string> = new Set()
  private completionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private idleDeferralTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private wakeScheduler = new WakeScheduler()
  private notificationQueueByParent: Map<string, Promise<void>> = new Map()
  private enableParentSessionNotifications: boolean
  private cachedCircuitBreakerSettings?: CircuitBreakerSettings
  private handoffCompression?: DcpHandoffCompression
  /** Active nested bypass admits per concurrency key (maxDepth cap). */
  private nestedActive: Map<string, number> = new Map()
  /** Task IDs admitted via nested bypass — used to decrement `nestedActive` exactly once. */
  private nestedBypassTaskIds: Set<string> = new Set()
  /** Elapsed-time bound supervisor (U7 wall-clock). OFF by default — arms nothing when disabled. */
  private wallclock = new WallclockSupervisor()
  /** Grace timers pending a terminal wall-clock mark, keyed by task id. */
  private wallclockGraceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  readonly taskHistory = new TaskHistory()

  constructor(
    ctx: PluginInput,
    config?: BackgroundTaskConfig,
    options?: {
      tmuxConfig?: TmuxConfig
      onSubagentSessionCreated?: OnSubagentSessionCreated
      onShutdown?: () => void
      enableParentSessionNotifications?: boolean
      handoffCompression?: DcpHandoffCompression
    }
  ) {
    this.tasks = new Map()
    this.notifications = new Map()
    this.pendingByParent = new Map()
    this.client = ctx.client
    this.directory = ctx.directory
    this.concurrencyManager = new ConcurrencyManager(config)
    this.config = config
    this.tmuxEnabled = options?.tmuxConfig?.enabled ?? false
    this.onSubagentSessionCreated = options?.onSubagentSessionCreated
    this.onShutdown = options?.onShutdown
    this.enableParentSessionNotifications = options?.enableParentSessionNotifications ?? true
    this.handoffCompression = options?.handoffCompression
    this.registerProcessCleanup()
  }

  /**
   * Persist a lightweight handle for the given task. Called on running and
   * terminal transitions only — never on intermediate progress updates (C8).
   * Best-effort: write failures are logged and never break task lifecycle.
   */
  private persistHandle(task: BackgroundTask): void {
    try {
      writeHandle(this.directory, task)
    } catch (error) {
      log("[background-agent] Failed to persist background handle:", { taskId: task.id, error })
    }
  }

  private armWallclock(task: BackgroundTask): void {
    const timeoutMs = this.config?.wallClockTimeoutMs ?? DEFAULT_WALL_CLOCK_TIMEOUT_MS
    if (timeoutMs === 0 || timeoutMs === undefined || !task.startedAt) return
    const startedAtMs = task.startedAt.getTime()
    this.wallclock.arm(task.id, startedAtMs, timeoutMs, () => {
      void this.onWallclockFire(task.id)
    })
  }

  private disarmWallclock(taskId: string): void {
    this.wallclock.disarm(taskId)
    const grace = this.wallclockGraceTimers.get(taskId)
    if (grace !== undefined) {
      clearTimeout(grace)
      this.wallclockGraceTimers.delete(taskId)
    }
  }

  private async onWallclockFire(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task?.status !== "running") return
    if (this.wallclockGraceTimers.has(taskId)) return
    if (task.sessionID) {
      this.abortSessionQuietly(task.sessionID, "wall-clock-timeout")
    }
    const graceMs = this.config?.wallClockAbortGraceMs ?? DEFAULT_WALL_CLOCK_ABORT_GRACE_MS
    const startedAtMs = task.startedAt?.getTime() ?? Date.now()
    const limitMs = this.config?.wallClockTimeoutMs ?? DEFAULT_WALL_CLOCK_TIMEOUT_MS
    const timer = setTimeout(() => {
      this.wallclockGraceTimers.delete(taskId)
      void this.completeWallclockTimeout(taskId, startedAtMs, limitMs)
    }, graceMs)
    this.wallclockGraceTimers.set(taskId, timer)
  }

  private async completeWallclockTimeout(taskId: string, startedAtMs: number, limitMs: number): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task?.status !== "running") return
    const elapsedMs = Date.now() - startedAtMs
    const elapsedMin = Math.round(elapsedMs / 60000)
    const limitMin = Math.round(limitMs / 60000)
    task.status = "cancelled"
    task.terminalReason = "wall-clock-timeout"
    task.error = `Wall-clock timeout (elapsed ${elapsedMin}min, limit ${limitMin}min)\n\n${formatWallclockTimeout(task.id, elapsedMs, limitMs)}`
    task.completedAt = new Date()
    this.persistHandle(task)
    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
    this.decrementNestedActive(task)
    try {
      await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
    } catch (err) {
      log("[background-agent] Error in notifyParentSession for wall-clock task:", { taskId: task.id, error: err })
    }
  }

  /**
   * Recover handles persisted by a previous manager/process. Sweeps stale
   * handles first, then loads the remainder into memory. Persisted
   * `running|pending` handles are reconciled against the live host instead of
   * being flattened to a false `"interrupt"` (C6). No concurrency is
   * re-acquired for restored running handles (C7).
   */
  async restoreHandles(): Promise<void> {
    const swept = sweepStaleHandles(this.directory)
    const handles = readHandles(this.directory)

    let restored = 0
    for (const handle of handles) {
      if (this.tasks.has(handle.taskId)) {
        continue
      }

      const task = restoreTaskFromHandle(handle)
      this.tasks.set(handle.taskId, task)
      restored++

      if (handle.status === "running" || handle.status === "pending") {
        await this.reconcileRestoredTask(task, handle)
      }
    }

    if (restored > 0 || swept > 0) {
      log("[background-agent] Restored background handles:", { restored, swept })
    }
  }

  /**
   * Probe the live host for a persisted in-flight handle and apply the
   * reconciled outcome. Never throws: any unexpected failure degrades to
   * `statusUncertain`, never a false completion. `restoreHandles()`'s caller
   * is fire-and-forget (`create-managers.ts`), so rejection is not an option.
   */
  private async reconcileRestoredTask(task: BackgroundTask, handle: BgHandle): Promise<void> {
    let outcome: ReconcileOutcome
    try {
      outcome = await reconcileHandle(this.client, handle)
    } catch (error) {
      log("[background-agent] Handle reconciliation failed:", { taskId: handle.taskId, error })
      outcome = { status: "statusUncertain", terminalReason: "uncertain" }
    }

    if (outcome.status === "running") {
      task.status = "running"
      if (task.sessionID) {
        registerSubagentSession(task.sessionID, task.parentSessionID)
      }
      // C7: a restored running handle must NOT re-acquire its concurrency slot.
      task.concurrencyKey = undefined
      const pending = this.pendingByParent.get(task.parentSessionID) ?? new Set<string>()
      pending.add(task.id)
      this.pendingByParent.set(task.parentSessionID, pending)
      this.startPolling()
      this.armWallclock(task)
      return
    }

    task.status = outcome.status
    task.terminalReason = outcome.terminalReason
    task.completedAt = new Date()
    this.persistHandle(task)
    this.disarmWallclock(task.id)
  }

  async launch(input: LaunchInput): Promise<BackgroundTask> {
    log("[background-agent] launch() called with:", {
      agent: input.agent,
      model: input.model,
      description: input.description,
      parentSessionID: input.parentSessionID,
    })

    if (!input.agent || input.agent.trim() === "") {
      throw new Error("Agent parameter is required")
    }

    const task: BackgroundTask = {
      id: `bg_${crypto.randomUUID().slice(0, 8)}`,
      status: "pending",
      queuedAt: new Date(),
      // Do NOT set startedAt - will be set when running
      // Do NOT set sessionID - will be set when running
      description: input.description,
      prompt: input.prompt,
      agent: input.agent,
      parentSessionID: input.parentSessionID,
      parentMessageID: input.parentMessageID,
      parentModel: input.parentModel,
      parentAgent: input.parentAgent,
      parentTools: input.parentTools,
      model: input.model,
      category: input.category,
    }

    this.tasks.set(task.id, task)
    this.taskHistory.record(input.parentSessionID, { id: task.id, agent: input.agent, description: input.description, status: "pending", category: input.category })

    // Track for batched notifications immediately (pending state)
    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(task.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    const key = this.getConcurrencyKeyFromInput(input)
    const queue = this.queuesByKey.get(key) ?? []
    queue.push({ task, input })
    this.queuesByKey.set(key, queue)

    log("[background-agent] Task queued:", { taskId: task.id, key, queueLength: queue.length })

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: task.id,
        description: input.description,
        agent: input.agent,
        isBackground: true,
        status: "queued",
        skills: input.skills,
      })
    }

    // Trigger processing (fire-and-forget)
    this.processKey(key)

    return task
  }

  private async processKey(key: string): Promise<void> {
    if (this.processingKeys.has(key)) {
      return
    }

    this.processingKeys.add(key)
    let acquired = false

    try {
      const queue = this.queuesByKey.get(key)
      while (queue && queue.length > 0) {
        const item = queue[0]

        const nestedEnabled = this.config?.nestedAdmission?.enabled ?? DEFAULT_NESTED_ADMISSION_ENABLED
        const maxDepth = this.config?.nestedAdmission?.maxDepth ?? DEFAULT_NESTED_MAX_DEPTH
        const admission = classifyAdmission(item.input.parentSessionID, maxDepth)

        if (admission.kind === "nested" && nestedEnabled) {
          const result = await this.admitNested(key, item, maxDepth)
          if (result.kind === "skip") {
            queue.shift()
            continue
          }
          acquired = result.slotHeld
          try {
            await this.startTask(item)
            // startTask is responsible for releasing the slot (via task.concurrencyKey lifecycle)
            acquired = false
          } catch (error) {
            log("[background-agent] Error starting nested task:", error)
            if (!item.task.concurrencyKey && acquired) {
              this.concurrencyManager.release(key)
              acquired = false
            }
            this.decrementNestedActive(item.task)
          }
          // Bypass-admitted tasks never took a slot; clear the phantom key so the
          // lifecycle release paths don't decrement a slot that was never acquired.
          if (!result.slotHeld) {
            item.task.concurrencyKey = undefined
          }
          queue.shift()
          continue
        }

        // Root admission (or nested with the exemption disabled): bounded by admissionTimeoutMs.
        const admissionTimeoutMs = this.config?.admissionTimeoutMs ?? DEFAULT_ADMISSION_TIMEOUT_MS
        const outcome = await this.concurrencyManager.acquireWithDeadline(key, admissionTimeoutMs)

        if (!outcome.granted) {
          if (outcome.reason === "cancelled") {
            item.task.status = "cancelled"
            item.task.completedAt = new Date()
            this.persistHandle(item.task)
            queue.shift()
            continue
          }
          // Timeout: the queue is saturated — terminate truthfully instead of hanging.
          const limit = this.concurrencyManager.getConcurrencyLimit(key)
          await this.terminateQueuedTask(
            item.task,
            "queue-saturated",
            `Queue admission timed out after ${outcome.waitedMs}ms (key "${key}", limit ${limit})`,
          )
          queue.shift()
          continue
        }

        acquired = true

        if (item.task.status === "cancelled" || item.task.status === "error") {
          this.concurrencyManager.release(key)
          acquired = false
          queue.shift()
          continue
        }

        try {
          await this.startTask(item)
          // startTask is responsible for releasing the slot (via task.concurrencyKey lifecycle)
          acquired = false
        } catch (error) {
          log("[background-agent] Error starting task:", error)
          // Release concurrency slot if startTask failed and didn't release it itself
          // This prevents slot leaks when errors occur after acquire but before task.concurrencyKey is set
          if (!item.task.concurrencyKey && acquired) {
            this.concurrencyManager.release(key)
            acquired = false
          }
        }

        queue.shift()
      }
    } finally {
      // Defense-in-depth: if some unexpected path left the slot held, release it here
      // to prevent slot leaks. Skipped when acquired=false (responsibility handed off).
      if (acquired) {
        this.concurrencyManager.release(key)
      }
      this.processingKeys.delete(key)
    }
  }

  /**
   * Admit a nested launch. Bypass mode grants immediately without touching the
   * semaphore; reserve mode first tries the reserved slot with a bounded wait
   * and falls back to bypass overflow. Both modes enforce the maxDepth cap.
   * Returns "skip" when the item was terminated (depth exceeded / cancelled).
   */
  private async admitNested(
    key: string,
    item: QueueItem,
    maxDepth: number,
  ): Promise<{ kind: "admitted"; slotHeld: boolean } | { kind: "skip" }> {
    const mode = this.config?.nestedAdmission?.mode ?? DEFAULT_NESTED_ADMISSION_MODE

    if (mode === "reserve") {
      const outcome = await this.concurrencyManager.acquireWithDeadline(key, NESTED_RESERVE_ATTEMPT_TIMEOUT_MS)
      if (outcome.granted) {
        return { kind: "admitted", slotHeld: true }
      }
      if (outcome.reason === "cancelled") {
        item.task.status = "cancelled"
        item.task.completedAt = new Date()
        this.persistHandle(item.task)
        return { kind: "skip" }
      }
      // Reserved slot taken → fall through to bypass overflow (still capped).
    }

    const active = this.nestedActive.get(key) ?? 0
    if (active >= maxDepth) {
      await this.terminateQueuedTask(
        item.task,
        "nested-depth-exceeded",
        `Nested admission depth exceeded (maxDepth ${maxDepth}, key "${key}")`,
      )
      return { kind: "skip" }
    }
    this.nestedActive.set(key, active + 1)
    this.nestedBypassTaskIds.add(item.task.id)
    return { kind: "admitted", slotHeld: false }
  }

  /**
   * Terminal `stopped` outcome for a queued task that was never admitted.
   * Mirrors the cancelTask terminal+notify sequence but never releases a slot
   * (none was taken) and routes through the same parent-notification pipeline.
   */
  private async terminateQueuedTask(
    task: BackgroundTask,
    terminalReason: BackgroundTerminalReason,
    errorMessage: string,
  ): Promise<void> {
    task.status = "stopped"
    task.terminalReason = terminalReason
    task.completedAt = new Date()
    task.error = errorMessage
    this.persistHandle(task)
    this.disarmWallclock(task.id)
    this.taskHistory.record(task.parentSessionID, {
      id: task.id,
      sessionID: task.sessionID,
      agent: task.agent,
      description: task.description,
      status: "stopped",
      category: task.category,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    })

    const existingTimer = this.completionTimers.get(task.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.completionTimers.delete(task.id)
    }

    const idleTimer = this.idleDeferralTimers.get(task.id)
    if (idleTimer) {
      clearTimeout(idleTimer)
      this.idleDeferralTimers.delete(task.id)
    }

    this.cleanupPendingByParent(task)

    this.markForNotification(task)
    try {
      await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
    } catch (err) {
      log("[background-agent] Error in notifyParentSession for stopped task:", { taskId: task.id, error: err })
    }
  }

  /**
   * Decrement the nested bypass count for a task exactly once. Idempotent:
   * repeated calls after the first are no-ops and can never underflow.
   */
  private decrementNestedActive(task: BackgroundTask): void {
    if (!this.nestedBypassTaskIds.has(task.id)) return
    this.nestedBypassTaskIds.delete(task.id)
    const key = task.concurrencyGroup ?? task.concurrencyKey
    if (!key) return
    const current = this.nestedActive.get(key) ?? 0
    if (current > 0) {
      this.nestedActive.set(key, current - 1)
    }
  }

  private async startTask(item: QueueItem): Promise<void> {
    const { task, input } = item

    log("[background-agent] Starting task:", {
      taskId: task.id,
      agent: input.agent,
      model: input.model,
    })

    const concurrencyKey = this.getConcurrencyKeyFromInput(input)

    const parentSession = await this.client.session.get({
      path: { id: input.parentSessionID },
    }).catch((err) => {
      log(`[background-agent] Failed to get parent session: ${err}`)
      return null
    })
    const parentDirectory = parentSession?.data?.directory ?? this.directory
    log(`[background-agent] Parent dir: ${parentSession?.data?.directory}, using: ${parentDirectory}`)

    const createResult = await this.client.session.create({
      body: {
        parentID: input.parentSessionID,
        title: `${input.description} (@${input.agent} subagent)`,
      },
      query: {
        directory: parentDirectory,
      },
    })

    if (createResult.error) {
      throw new Error(`Failed to create background session: ${createResult.error}`)
    }

    if (!createResult.data?.id) {
      throw new Error("Failed to create background session: API returned no session ID")
    }

    const sessionID = createResult.data.id
    registerSubagentSession(sessionID, input.parentSessionID)

    log("[background-agent] tmux callback check", {
      hasCallback: !!this.onSubagentSessionCreated,
      tmuxEnabled: this.tmuxEnabled,
      isInsideTmux: isInsideTmux(),
      sessionID,
      parentID: input.parentSessionID,
    })

    if (this.onSubagentSessionCreated && this.tmuxEnabled && isInsideTmux()) {
      log("[background-agent] Invoking tmux callback NOW", { sessionID })
      await this.onSubagentSessionCreated({
        sessionID,
        parentID: input.parentSessionID,
        title: input.description,
      }).catch((err) => {
        log("[background-agent] Failed to spawn tmux pane:", err)
      })
      log("[background-agent] tmux callback completed, waiting 200ms")
      await new Promise(r => setTimeout(r, 200))
    } else {
      log("[background-agent] SKIP tmux callback - conditions not met")
    }

    task.status = "running"
    task.startedAt = new Date()
    task.sessionID = sessionID
    task.progress = {
      toolCalls: 0,
      lastUpdate: new Date(),
    }
    task.concurrencyKey = concurrencyKey
    task.concurrencyGroup = concurrencyKey
    this.persistHandle(task)
    this.armWallclock(task)

    this.taskHistory.record(input.parentSessionID, { id: task.id, sessionID, agent: input.agent, description: input.description, status: "running", category: input.category, startedAt: task.startedAt })
    this.startPolling()

    log("[background-agent] Launching task:", { taskId: task.id, sessionID, agent: input.agent })

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.updateTask(task.id, "running")
    }

    log("[background-agent] Calling prompt (fire-and-forget) for launch with:", {
      sessionID,
      agent: input.agent,
      model: input.model,
      hasSkillContent: !!input.skillContent,
      promptLength: input.prompt.length,
    })

    // Fire-and-forget prompt via promptAsync (no response body needed)
    // Include model if caller provided one (e.g., from Morpheus category configs)
    // IMPORTANT: variant must be a top-level field in the body, NOT nested inside model
    // OpenCode's PromptInput schema expects: { model: { providerID, modelID }, variant: "max" }
    const launchModel = input.model
      ? { providerID: input.model.providerID, modelID: input.model.modelID }
      : undefined
    const launchVariant = input.model?.variant
    const launchTemperature = input.model?.temperature

    if (launchTemperature !== undefined) {
      setSessionTemperature(sessionID, launchTemperature)
    }

    promptWithModelSuggestionRetry(this.client, {
      path: { id: sessionID },
      body: {
        agent: input.agent,
        ...(launchModel ? { model: launchModel } : {}),
        ...(launchVariant ? { variant: launchVariant } : {}),
        system: input.skillContent,
        tools: (() => {
          const tools = {
            task: true,
            question: false,
            ...getAgentToolRestrictions(input.agent),
          }
          setSessionTools(sessionID, tools)
          return tools
        })(),
        parts: [{ type: "text", text: input.prompt }],
      },
    }).catch((error) => {
      log("[background-agent] promptAsync error:", error)
      const existingTask = this.findBySession(sessionID)
      if (existingTask) {
        existingTask.status = "interrupt"
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes("agent.name") || errorMessage.includes("undefined")) {
          existingTask.error = `Agent "${input.agent}" not found. Make sure the agent is registered in your opencode.json or provided by a plugin.`
        } else {
          existingTask.error = errorMessage
        }
        existingTask.completedAt = new Date()
        this.persistHandle(existingTask)
        this.disarmWallclock(existingTask.id)
        if (existingTask.concurrencyKey) {
          this.concurrencyManager.release(existingTask.concurrencyKey)
          existingTask.concurrencyKey = undefined
        }

        // Abort the session to prevent infinite polling hang
        this.abortSessionQuietly(sessionID, "error-recovery")

        this.markForNotification(existingTask)
        this.cleanupPendingByParent(existingTask)
        this.enqueueNotificationForParent(existingTask.parentSessionID, () => this.notifyParentSession(existingTask)).catch(err => {
          log("[background-agent] Failed to notify on error:", err)
        })
      }
    })
  }

  getTask(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  getTasksByParentSession(sessionID: string): BackgroundTask[] {
    const result: BackgroundTask[] = []
    for (const task of this.tasks.values()) {
      if (task.parentSessionID === sessionID) {
        result.push(task)
      }
    }
    return result
  }

  getAllDescendantTasks(sessionID: string): BackgroundTask[] {
    const result: BackgroundTask[] = []
    const directChildren = this.getTasksByParentSession(sessionID)

    for (const child of directChildren) {
      result.push(child)
      if (child.sessionID) {
        const descendants = this.getAllDescendantTasks(child.sessionID)
        result.push(...descendants)
      }
    }

    return result
  }

  findBySession(sessionID: string): BackgroundTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.sessionID === sessionID) {
        return task
      }
    }
    return undefined
  }

  private getConcurrencyKeyFromInput(input: LaunchInput): string {
    if (input.model) {
      return `${input.model.providerID}/${input.model.modelID}`
    }
    return input.agent
  }

  /**
   * Track a task created elsewhere (e.g., from task) for notification tracking.
   * This allows tasks created by other tools to receive the same toast/prompt notifications.
   */
  async trackTask(input: {
    taskId: string
    sessionID: string
    parentSessionID: string
    description: string
    agent?: string
    parentAgent?: string
    concurrencyKey?: string
  }): Promise<BackgroundTask> {
    const existingTask = this.tasks.get(input.taskId)
    if (existingTask) {
      // P2 fix: Clean up old parent's pending set BEFORE changing parent
      // Otherwise cleanupPendingByParent would use the new parent ID
      const parentChanged = input.parentSessionID !== existingTask.parentSessionID
      if (parentChanged) {
        this.cleanupPendingByParent(existingTask)  // Clean from OLD parent
        existingTask.parentSessionID = input.parentSessionID
      }
      if (input.parentAgent !== undefined) {
        existingTask.parentAgent = input.parentAgent
      }
      if (!existingTask.concurrencyGroup) {
        existingTask.concurrencyGroup = input.concurrencyKey ?? existingTask.agent
      }

      if (existingTask.sessionID) {
        registerSubagentSession(existingTask.sessionID, input.parentSessionID)
      }
      this.startPolling()

      // Track for batched notifications if task is pending or running
      if (existingTask.status === "pending" || existingTask.status === "running") {
        const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
        pending.add(existingTask.id)
        this.pendingByParent.set(input.parentSessionID, pending)
      } else if (!parentChanged) {
        // Only clean up if parent didn't change (already cleaned above if it did)
        this.cleanupPendingByParent(existingTask)
      }

      log("[background-agent] External task already registered:", { taskId: existingTask.id, sessionID: existingTask.sessionID, status: existingTask.status })

      return existingTask
    }

    const concurrencyGroup = input.concurrencyKey ?? input.agent ?? "task"

    // Acquire concurrency slot if a key is provided
    if (input.concurrencyKey) {
      await this.concurrencyManager.acquire(input.concurrencyKey)
    }

    const task: BackgroundTask = {
      id: input.taskId,
      sessionID: input.sessionID,
      parentSessionID: input.parentSessionID,
      parentMessageID: "",
      description: input.description,
      prompt: "",
      agent: input.agent || "task",
      status: "running",
      startedAt: new Date(),
      progress: {
        toolCalls: 0,
        lastUpdate: new Date(),
      },
      parentAgent: input.parentAgent,
      concurrencyKey: input.concurrencyKey,
      concurrencyGroup,
    }

    this.tasks.set(task.id, task)
    this.persistHandle(task)
    registerSubagentSession(input.sessionID, input.parentSessionID)
    this.startPolling()
    this.taskHistory.record(input.parentSessionID, { id: task.id, sessionID: input.sessionID, agent: input.agent || "task", description: input.description, status: "running", startedAt: task.startedAt })

    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(task.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    log("[background-agent] Registered external task:", { taskId: task.id, sessionID: input.sessionID })

    return task
  }

  async resume(input: ResumeInput): Promise<BackgroundTask> {
    const existingTask = this.findBySession(input.sessionId)
    if (!existingTask) {
      throw new Error(`Task not found for session: ${input.sessionId}`)
    }

    if (!existingTask.sessionID) {
      throw new Error(`Task has no sessionID: ${existingTask.id}`)
    }

    if (existingTask.status === "running") {
      log("[background-agent] Resume skipped - task already running:", {
        taskId: existingTask.id,
        sessionID: existingTask.sessionID,
      })
      return existingTask
    }

    const completionTimer = this.completionTimers.get(existingTask.id)
    if (completionTimer) {
      clearTimeout(completionTimer)
      this.completionTimers.delete(existingTask.id)
    }

    // Re-acquire concurrency using the persisted concurrency group
    const concurrencyKey = existingTask.concurrencyGroup ?? existingTask.agent
    await this.concurrencyManager.acquire(concurrencyKey)
    existingTask.concurrencyKey = concurrencyKey
    existingTask.concurrencyGroup = concurrencyKey


    existingTask.status = "running"
    existingTask.completedAt = undefined
    existingTask.error = undefined
    existingTask.parentSessionID = input.parentSessionID
    existingTask.parentMessageID = input.parentMessageID
    existingTask.parentModel = input.parentModel
    existingTask.parentAgent = input.parentAgent
    if (input.parentTools) {
      existingTask.parentTools = input.parentTools
    }
    // Reset startedAt on resume to prevent immediate completion
    // The MIN_IDLE_TIME_MS check uses startedAt, so resumed tasks need fresh timing
    existingTask.startedAt = new Date()
    this.persistHandle(existingTask)
    this.armWallclock(existingTask)

    existingTask.progress = {
      toolCalls: existingTask.progress?.toolCalls ?? 0,
      lastUpdate: new Date(),
    }

    this.startPolling()
    if (existingTask.sessionID) {
      registerSubagentSession(existingTask.sessionID, input.parentSessionID)
    }

    if (input.parentSessionID) {
      const pending = this.pendingByParent.get(input.parentSessionID) ?? new Set()
      pending.add(existingTask.id)
      this.pendingByParent.set(input.parentSessionID, pending)
    }

    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.addTask({
        id: existingTask.id,
        description: existingTask.description,
        agent: existingTask.agent,
        isBackground: true,
      })
    }

    log("[background-agent] Resuming task:", { taskId: existingTask.id, sessionID: existingTask.sessionID })

    log("[background-agent] Resuming task - calling prompt (fire-and-forget) with:", {
      sessionID: existingTask.sessionID,
      agent: existingTask.agent,
      model: existingTask.model,
      promptLength: input.prompt.length,
    })

    // Fire-and-forget prompt via promptAsync (no response body needed)
    // Include model if task has one (preserved from original launch with category config)
    // variant must be top-level in body, not nested inside model (OpenCode PromptInput schema)
    const resumeModel = existingTask.model
      ? { providerID: existingTask.model.providerID, modelID: existingTask.model.modelID }
      : undefined
    const resumeVariant = existingTask.model?.variant

    this.client.session.promptAsync({
      path: { id: existingTask.sessionID },
      body: {
        agent: existingTask.agent,
        ...(resumeModel ? { model: resumeModel } : {}),
        ...(resumeVariant ? { variant: resumeVariant } : {}),
        tools: (() => {
          const tools = {
            task: true,
            question: false,
            ...getAgentToolRestrictions(existingTask.agent),
          }
          setSessionTools(existingTask.sessionID as string, tools)
          return tools
        })(),
        parts: [{ type: "text", text: input.prompt }],
      },
    }).catch((error) => {
      log("[background-agent] resume prompt error:", error)
      existingTask.status = "interrupt"
      const errorMessage = error instanceof Error ? error.message : String(error)
      existingTask.error = errorMessage
      existingTask.completedAt = new Date()
      this.persistHandle(existingTask)
      this.disarmWallclock(existingTask.id)

      // Release concurrency on error to prevent slot leaks
      if (existingTask.concurrencyKey) {
        this.concurrencyManager.release(existingTask.concurrencyKey)
        existingTask.concurrencyKey = undefined
      }

      // Abort the session to prevent infinite polling hang
      if (existingTask.sessionID) {
        this.abortSessionQuietly(existingTask.sessionID, "resume-error")
      }

      this.markForNotification(existingTask)
      this.cleanupPendingByParent(existingTask)
      this.enqueueNotificationForParent(existingTask.parentSessionID, () => this.notifyParentSession(existingTask)).catch(err => {
        log("[background-agent] Failed to notify on resume error:", err)
      })
    })

    return existingTask
  }

  /** Revive a terminal task with a new prompt, from memory or disk. Bounded admission; saturated queue fails truthfully. */
  async revive(input: ReviveInput): Promise<BackgroundTask> {
    const id = input.taskId ?? input.sessionId ?? ""
    let task = input.taskId !== undefined ? this.tasks.get(input.taskId) : undefined
    if (!task && input.sessionId !== undefined) task = this.findBySession(input.sessionId)
    if (task?.status === "running") {
      log("[background-agent] Revive skipped - task already running:", { taskId: task.id, sessionID: task.sessionID })
      return task
    }
    const guidance: Record<ReviveBlockReason, string> = { active: `Task ${id} is still active; use background_output to inspect it.`, uncertain: `Task ${id} has unknown liveness; re-run with force: true to acknowledge this.`, "no-session": `Task ${id} has no session to revive (it never produced one, e.g. it was queue-saturated).`, "unknown-task": `Task ${id} is not revivable (unrecognised state).`, expired: `Task ${id} is not revivable (unrecognised state).` }
    if (!task) {
      const handle = findRevivableHandle(readHandles(this.directory), { taskId: input.taskId, sessionId: input.sessionId })
      if (!handle) throw new Error(`Task not found for revive: ${id}. It may have expired (handles are retained 30 minutes) or never existed.`)
      const handleEligibility = classifyRevivable(handle, { force: input.force })
      if (!handleEligibility.eligible) throw new Error(guidance[handleEligibility.reason])
      task = toReviveTask(handle, input.prompt)
    } else {
      task.prompt = input.prompt
      const taskEligibility = classifyRevivable(task, { force: input.force })
      if (!taskEligibility.eligible) throw new Error(guidance[taskEligibility.reason])
    }
    if (!task.sessionID) throw new Error(`Task has no sessionID: ${task.id}`)
    const sessionID = task.sessionID
    const completionTimer = this.completionTimers.get(task.id)
    if (completionTimer) { clearTimeout(completionTimer); this.completionTimers.delete(task.id) }
    task.status = "pending"; task.parentSessionID = input.parentSessionID; task.parentMessageID = input.parentMessageID
    if (input.parentModel !== undefined) task.parentModel = input.parentModel
    if (input.parentAgent !== undefined) task.parentAgent = input.parentAgent
    if (input.parentTools !== undefined) task.parentTools = input.parentTools
    this.tasks.set(task.id, task)
    this.taskHistory.record(task.parentSessionID, { id: task.id, sessionID, agent: task.agent, description: task.description, status: "pending", startedAt: task.startedAt })
    const pending = this.pendingByParent.get(task.parentSessionID) ?? new Set<string>()
    pending.add(task.id); this.pendingByParent.set(task.parentSessionID, pending)
    const key = task.concurrencyGroup ?? task.agent
    const maxDepth = this.config?.nestedAdmission?.maxDepth ?? DEFAULT_NESTED_MAX_DEPTH
    const admissionTimeoutMs = this.config?.admissionTimeoutMs ?? DEFAULT_ADMISSION_TIMEOUT_MS
    const nestedEnabled = this.config?.nestedAdmission?.enabled ?? DEFAULT_NESTED_ADMISSION_ENABLED
    const nestedMode = this.config?.nestedAdmission?.mode ?? DEFAULT_NESTED_ADMISSION_MODE
    const admission = classifyAdmission(input.parentSessionID, maxDepth)
    log("[background-agent] Reviving task:", { taskId: task.id, admission: admission.kind, key })

    // Mirrors processKey's nested contract: a nested revive must never await the
    // semaphore unboundedly (that is the Tier-1 U4 self-deadlock). Reserve mode
    // tries the bounded reserved slot, then both modes fall back to bypass
    // overflow capped by maxDepth.
    let slotHeld = true
    if (admission.kind === "nested" && nestedEnabled) {
      let bypass = true
      if (nestedMode === "reserve") {
        const reserved = await this.concurrencyManager.acquireWithDeadline(key, NESTED_RESERVE_ATTEMPT_TIMEOUT_MS)
        if (reserved.granted) {
          bypass = false
        } else if (reserved.reason === "cancelled") {
          task.status = "cancelled"
          this.persistHandle(task)
          throw new Error(`Revive admission cancelled for task ${task.id}.`)
        }
      }
      if (bypass) {
        const active = this.nestedActive.get(key) ?? 0
        if (active >= maxDepth) {
          const depthMessage = `Nested admission depth exceeded (maxDepth ${maxDepth}, key "${key}")`
          await this.terminateQueuedTask(task, "nested-depth-exceeded", depthMessage)
          throw new Error(depthMessage)
        }
        this.nestedActive.set(key, active + 1)
        this.nestedBypassTaskIds.add(task.id)
        slotHeld = false
      }
    } else {
      const outcome = await this.concurrencyManager.acquireWithDeadline(key, admissionTimeoutMs)
      if (!outcome.granted) {
        if (outcome.reason === "cancelled") {
          task.status = "cancelled"
          this.persistHandle(task)
          throw new Error(`Revive admission cancelled for task ${task.id}.`)
        }
        const errorMessage = `Queue admission timed out after ${outcome.waitedMs}ms (key "${key}", limit ${this.concurrencyManager.getConcurrencyLimit(key)})`
        await this.terminateQueuedTask(task, "queue-saturated", errorMessage)
        throw new Error(errorMessage)
      }
    }

    // A bypass-admitted revive never took a slot: leave concurrencyKey unset so
    // the lifecycle release paths cannot decrement a slot that was never acquired.
    task.concurrencyGroup = key
    task.concurrencyKey = slotHeld ? key : undefined
    task.status = "running"; task.startedAt = new Date(); task.completedAt = undefined; task.error = undefined
    task.progress = { toolCalls: task.progress?.toolCalls ?? 0, lastUpdate: new Date() }
    this.persistHandle(task)
    this.armWallclock(task)
    registerSubagentSession(sessionID, input.parentSessionID)
    this.startPolling()
    const toastManager = getTaskToastManager()
    if (toastManager) toastManager.addTask({ id: task.id, description: task.description, agent: task.agent, isBackground: true })
    const tools = { task: true, question: false, ...getAgentToolRestrictions(task.agent) }
    setSessionTools(sessionID, tools)
    const reviveModel = task.model ? { providerID: task.model.providerID, modelID: task.model.modelID } : undefined
    const reviveVariant = task.model?.variant
    // Mirrors resume() promptAsync (keep in sync)
    this.client.session.promptAsync({
      path: { id: sessionID },
      body: { agent: task.agent, ...(reviveModel ? { model: reviveModel } : {}), ...(reviveVariant ? { variant: reviveVariant } : {}), tools, parts: [{ type: "text", text: input.prompt }] },
    }).catch((error) => {
      log("[background-agent] revive prompt error:", error)
      task.status = "interrupt"; task.error = error instanceof Error ? error.message : String(error); task.completedAt = new Date()
      this.persistHandle(task)
      this.disarmWallclock(task.id)
      this.decrementNestedActive(task)
      if (task.concurrencyKey) { this.concurrencyManager.release(task.concurrencyKey); task.concurrencyKey = undefined }
      this.abortSessionQuietly(sessionID, "revive-error")
      this.markForNotification(task); this.cleanupPendingByParent(task)
      this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task)).catch((err) => {
        log("[background-agent] Failed to notify on revive error:", err)
      })
    })
    return task
  }

  /** Revivable terminal tasks: in-memory first (wins on taskId), then disk; newest-first. */
  listRevivable(parentSessionID?: string): Array<{ taskId: string; description: string; agent: string; status: string; sessionID: string; terminalReason?: string }> {
    const seen = new Set<string>()
    const rows: Array<{ taskId: string; description: string; agent: string; status: string; sessionID: string; terminalReason?: string; ts: number }> = []
    const consider = (id: string, parent: string, description: string, agent: string, status: string, sessionID: string | undefined, terminalReason: string | undefined, ts: number): void => {
      if (seen.has(id) || sessionID === undefined) return
      if (parentSessionID !== undefined && parent !== parentSessionID) return
      if (!classifyRevivable({ status, sessionID }, {}).eligible) return
      seen.add(id); rows.push({ taskId: id, description, agent, status, sessionID, terminalReason, ts })
    }
    for (const task of this.tasks.values()) consider(task.id, task.parentSessionID, task.description, task.agent, task.status, task.sessionID, task.terminalReason, task.completedAt?.getTime() ?? task.startedAt?.getTime() ?? task.queuedAt?.getTime() ?? 0)
    for (const handle of readHandles(this.directory)) consider(handle.taskId, handle.parentSessionID, handle.description, handle.agent, handle.status, handle.sessionID, handle.terminalReason, handle.completedAt ?? handle.startedAt ?? handle.queuedAt ?? 0)
    rows.sort((a, b) => b.ts - a.ts)
    return rows.map((row) => ({ taskId: row.taskId, description: row.description, agent: row.agent, status: row.status, sessionID: row.sessionID, terminalReason: row.terminalReason }))
  }

  private async checkSessionTodos(sessionID: string): Promise<boolean> {
    try {
      const response = await this.client.session.todo({
        path: { id: sessionID },
      })
      const todos = normalizeSDKResponse(response, [] as Todo[], { preferResponseOnMissingData: true })
      if (!todos || todos.length === 0) return false

      const incomplete = todos.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled"
      )
      return incomplete.length > 0
    } catch {
      return false
    }
  }

  handleEvent(event: Event): void {
    const props = event.properties

    if (event.type === "message.part.updated" || event.type === "message.part.delta") {
      if (!props || typeof props !== "object" || !("sessionID" in props)) return
      const partInfo = props as unknown as MessagePartInfo
      const sessionID = partInfo?.sessionID
      if (!sessionID) return

      const task = this.findBySession(sessionID)
      if (!task) return

      // Clear any pending idle deferral timer since the task is still active
      const existingTimer = this.idleDeferralTimers.get(task.id)
      if (existingTimer) {
        clearTimeout(existingTimer)
        this.idleDeferralTimers.delete(task.id)
      }

      if (!task.progress) {
        task.progress = {
          toolCalls: 0,
          lastUpdate: new Date(),
        }
      }
      task.progress.lastUpdate = new Date()

      if (partInfo?.type === "tool" || partInfo?.tool) {
        const countedToolPartIDs = task.progress.countedToolPartIDs ?? new Set<string>()
        const partId = partInfo.id
        const isRunning = partInfo.state?.status === "running"
        const alreadyCounted = partId !== undefined && countedToolPartIDs.has(partId)
        if (!alreadyCounted) {
          if (partId !== undefined && isRunning) countedToolPartIDs.add(partId)
          task.progress.countedToolPartIDs = countedToolPartIDs
          task.progress.toolCalls += 1
          task.progress.lastTool = partInfo.tool

          if (this.cachedCircuitBreakerSettings == null) {
            this.cachedCircuitBreakerSettings = resolveCircuitBreakerSettings(this.config)
          }
          const circuitBreaker = this.cachedCircuitBreakerSettings

          if (partInfo.tool) {
            task.progress.toolCallWindow = recordToolCall(
              task.progress.toolCallWindow,
              partInfo.tool,
              circuitBreaker,
              partInfo.state?.input
            )

            if (circuitBreaker.enabled) {
              const loopDetection = detectRepetitiveToolUse(task.progress.toolCallWindow)
              if (loopDetection.triggered) {
                log("[background-agent] Circuit breaker: consecutive tool usage detected", {
                  taskId: task.id,
                  agent: task.agent,
                  sessionID,
                  toolName: loopDetection.toolName,
                  repeatedCount: loopDetection.repeatedCount,
                })
                void this.cancelTask(task.id, {
                  source: "circuit-breaker",
                  reason: `Subagent called ${loopDetection.toolName} ${loopDetection.repeatedCount} consecutive times (threshold: ${circuitBreaker.consecutiveThreshold}). This usually indicates an infinite loop. The task was automatically cancelled to prevent excessive token usage.`,
                })
                return
              }
            }
          }

          const maxToolCalls = circuitBreaker.maxToolCalls
          if (task.progress.toolCalls >= maxToolCalls) {
            log("[background-agent] Circuit breaker: tool call limit reached", {
              taskId: task.id,
              toolCalls: task.progress.toolCalls,
              maxToolCalls,
              agent: task.agent,
              sessionID,
            })
            void this.cancelTask(task.id, {
              source: "circuit-breaker",
              reason: `Subagent exceeded maximum tool call limit (${maxToolCalls}). This usually indicates an infinite loop. The task was automatically cancelled to prevent excessive token usage.`,
            })
          }
        }
      }
    }

    if (event.type === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      const task = this.findBySession(sessionID)
      if (task?.status !== "running") return
      
      const startedAt = task.startedAt
      if (!startedAt) return

      // Edge guard: Require minimum elapsed time (5 seconds) before accepting idle
      const elapsedMs = Date.now() - startedAt.getTime()
      if (elapsedMs < MIN_IDLE_TIME_MS) {
        const remainingMs = MIN_IDLE_TIME_MS - elapsedMs
        if (!this.idleDeferralTimers.has(task.id)) {
          log("[background-agent] Deferring early session.idle:", { elapsedMs, remainingMs, taskId: task.id })
          const timer = setTimeout(() => {
            this.idleDeferralTimers.delete(task.id)
            this.handleEvent({ type: "session.idle", properties: { sessionID } })
          }, remainingMs)
          this.idleDeferralTimers.set(task.id, timer)
        } else {
          log("[background-agent] session.idle already deferred:", { elapsedMs, taskId: task.id })
        }
        return
      }

      // Edge guard: Verify session has actual assistant output before completing
      this.validateSessionHasOutput(sessionID).then(async (hasValidOutput) => {
        // Re-check status after async operation (could have been completed by polling)
        if (task.status !== "running") {
          log("[background-agent] Task status changed during validation, skipping:", { taskId: task.id, status: task.status })
          return
        }

        if (!hasValidOutput) {
          log("[background-agent] Session.idle but no valid output yet, waiting:", task.id)
          return
        }

        const hasIncompleteTodos = await this.checkSessionTodos(sessionID)

        // Re-check status after async operation again
        if (task.status !== "running") {
          log("[background-agent] Task status changed during todo check, skipping:", { taskId: task.id, status: task.status })
          return
        }

        if (hasIncompleteTodos) {
          log("[background-agent] Task has incomplete todos, waiting for todo-continuation:", task.id)
          return
        }

        await this.tryCompleteTask(task, "session.idle event")
      }).catch(err => {
        log("[background-agent] Error in session.idle handler:", err)
      })
    }

    if (event.type === "session.error") {
      const sessionID = typeof props?.sessionID === "string" ? props.sessionID : undefined
      if (!sessionID) return

      const task = this.findBySession(sessionID)
      if (task?.status !== "running") return

      const errorMessage = props ? getSessionErrorMessage(props) : undefined

      task.status = "error"
      task.error = errorMessage ?? "Session error"
      task.completedAt = new Date()
      this.persistHandle(task)
      this.disarmWallclock(task.id)
      this.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "error", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }
      this.decrementNestedActive(task)

      const completionTimer = this.completionTimers.get(task.id)
      if (completionTimer) {
        clearTimeout(completionTimer)
        this.completionTimers.delete(task.id)
      }

      const idleTimer = this.idleDeferralTimers.get(task.id)
      if (idleTimer) {
        clearTimeout(idleTimer)
        this.idleDeferralTimers.delete(task.id)
      }

      this.cleanupPendingByParent(task)
      this.tasks.delete(task.id)
      this.clearNotificationsForTask(task.id)
      this.refreshParentWake(task.parentSessionID)
      const toastManager = getTaskToastManager()
      if (toastManager) {
        toastManager.removeTask(task.id)
      }
      if (task.sessionID) {
        subagentSessions.delete(task.sessionID)
      }
    }

    if (event.type === "session.deleted") {
      const info = props?.info
      if (!info || typeof info.id !== "string") return
      const sessionID = info.id

      const tasksToCancel = new Map<string, BackgroundTask>()
      const directTask = this.findBySession(sessionID)
      if (directTask) {
        tasksToCancel.set(directTask.id, directTask)
      }
      for (const descendant of this.getAllDescendantTasks(sessionID)) {
        tasksToCancel.set(descendant.id, descendant)
      }

      if (tasksToCancel.size === 0) return

      for (const task of tasksToCancel.values()) {
        if (task.status === "running" || task.status === "pending") {
          void this.cancelTask(task.id, {
            source: "session.deleted",
            reason: "Session deleted",
            skipNotification: true,
          }).catch(err => {
            log("[background-agent] Failed to cancel task on session.deleted:", { taskId: task.id, error: err })
          })
        }

        const existingTimer = this.completionTimers.get(task.id)
        if (existingTimer) {
          clearTimeout(existingTimer)
          this.completionTimers.delete(task.id)
        }

        const idleTimer = this.idleDeferralTimers.get(task.id)
        if (idleTimer) {
          clearTimeout(idleTimer)
          this.idleDeferralTimers.delete(task.id)
        }

        this.cleanupPendingByParent(task)
        this.tasks.delete(task.id)
        this.clearNotificationsForTask(task.id)
        const toastManager = getTaskToastManager()
        if (toastManager) {
          toastManager.removeTask(task.id)
        }
        if (task.sessionID) {
          subagentSessions.delete(task.sessionID)
        }
      }
    }
  }

  markForNotification(task: BackgroundTask): void {
    const queue = this.notifications.get(task.parentSessionID) ?? []
    queue.push(task)
    this.notifications.set(task.parentSessionID, queue)
  }

  getPendingNotifications(sessionID: string): BackgroundTask[] {
    return this.notifications.get(sessionID) ?? []
  }

  /**
   * Check whether a parent-wake notification is currently in flight
   * for the given parent session.  Used by sync-task polling to avoid
   * concluding when a background task just completed but its
   * parent notification hasn't been delivered yet.
   */
  hasInFlightNotificationForParent(sessionID: string): boolean {
    return this.notificationQueueByParent.has(sessionID)
  }

  clearNotifications(sessionID: string): void {
    this.notifications.delete(sessionID)
  }

  /**
   * Validates that a session has actual assistant/tool output before marking complete.
   * Prevents premature completion when session.idle fires before agent responds.
   * Delegates to the shared `session-output` helper (also used by reconciliation).
   */
  private async validateSessionHasOutput(sessionID: string): Promise<boolean> {
    return validateSessionOutput(this.client, sessionID)
  }

  private clearNotificationsForTask(taskId: string): void {
    for (const [sessionID, tasks] of this.notifications.entries()) {
      const filtered = tasks.filter((t) => t.id !== taskId)
      if (filtered.length === 0) {
        this.notifications.delete(sessionID)
      } else {
        this.notifications.set(sessionID, filtered)
      }
    }
  }

  /**
   * Remove task from pending tracking for its parent session.
   * Cleans up the parent entry if no pending tasks remain.
   */
  private cleanupPendingByParent(task: BackgroundTask): void {
    if (!task.parentSessionID) return
    const pending = this.pendingByParent.get(task.parentSessionID)
    if (pending) {
      pending.delete(task.id)
      if (pending.size === 0) {
        this.pendingByParent.delete(task.parentSessionID)
      }
    }
  }

  private refreshParentWake(parentSessionID: string): void {
    if (this.config?.wakeScheduler?.enabled === false) return
    const readState = () => ({
      hasPendingChildren: (this.pendingByParent.get(parentSessionID)?.size ?? 0) > 0,
      hasUndeliveredNotifications: (this.notifications.get(parentSessionID)?.length ?? 0) > 0,
    })
    if (!shouldWakeForParent(readState())) {
      this.wakeScheduler.clear(parentSessionID)
      return
    }
    this.wakeScheduler.schedule(parentSessionID, {
      intervalMs: resolveWakeIntervalMs(this.config?.wakeScheduler),
      readState,
      deliverWake: async () => {
        await this.enqueueNotificationForParent(parentSessionID, async () => {
          await this.client.session.promptAsync({ path: { id: parentSessionID }, body: { noReply: true, parts: [{ type: "text", text: WAKE_REMINDER_TEXT }] } })
        })
      },
    })
  }

  /**
   * Fire-and-forget session abort. Logs failures at debug level instead of
   * swallowing errors silently — useful for diagnosing zombie sessions.
   */
  private abortSessionQuietly(sessionID: string, context?: string): void {
    this.client.session
      .abort({ path: { id: sessionID } })
      .catch((err) => {
        log(`[background-agent] Session abort failed${context ? ` (${context})` : ""}:`, {
          sessionID,
          error: err,
        })
      })
  }

  async cancelTask(
    taskId: string,
    options?: { source?: string; reason?: string; abortSession?: boolean; skipNotification?: boolean }
  ): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task || (task.status !== "running" && task.status !== "pending")) {
      return false
    }

    const source = options?.source ?? "cancel"
    const abortSession = options?.abortSession !== false
    const reason = options?.reason

    if (task.status === "pending") {
      const key = task.model
        ? `${task.model.providerID}/${task.model.modelID}`
        : task.agent
      const queue = this.queuesByKey.get(key)
      if (queue) {
        const index = queue.findIndex(item => item.task.id === taskId)
        if (index !== -1) {
          queue.splice(index, 1)
          if (queue.length === 0) {
            this.queuesByKey.delete(key)
          }
        }
      }
      log("[background-agent] Cancelled pending task:", { taskId, key })
    }

    task.status = "cancelled"
    task.completedAt = new Date()
    this.persistHandle(task)
    this.disarmWallclock(task.id)
    if (reason) {
      task.error = reason
    }
    this.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "cancelled", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
    this.decrementNestedActive(task)

    const existingTimer = this.completionTimers.get(task.id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.completionTimers.delete(task.id)
    }

    const idleTimer = this.idleDeferralTimers.get(task.id)
    if (idleTimer) {
      clearTimeout(idleTimer)
      this.idleDeferralTimers.delete(task.id)
    }

    this.cleanupPendingByParent(task)

    if (abortSession && task.sessionID) {
      this.abortSessionQuietly(task.sessionID, "cancel")
    }

    if (options?.skipNotification) {
      const toastManager = getTaskToastManager()
      if (toastManager) {
        toastManager.removeTask(task.id)
      }
      log(`[background-agent] Task cancelled via ${source} (notification skipped):`, task.id)
      return true
    }

    this.markForNotification(task)

    try {
      await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
      log(`[background-agent] Task cancelled via ${source}:`, task.id)
      this.refreshParentWake(task.parentSessionID)
    } catch (err) {
      log("[background-agent] Error in notifyParentSession for cancelled task:", { taskId: task.id, error: err })
    }

    return true
  }

  /**
   * Cancels a pending task by removing it from queue and marking as cancelled.
   * Does NOT abort session (no session exists yet) or release concurrency slot (wasn't acquired).
   */
  cancelPendingTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (task?.status !== "pending") {
      return false
    }

    void this.cancelTask(taskId, { source: "cancelPendingTask", abortSession: false })
    return true
  }

  /**
   * Cancel all active (pending/running) tasks spawned from a parent session.
   * Returns the number of tasks cancelled.
   */
  cancelAllForSession(parentSessionID: string): number {
    const tasksToCancel: string[] = []
    for (const task of this.tasks.values()) {
      if (task.parentSessionID === parentSessionID && (task.status === "pending" || task.status === "running")) {
        tasksToCancel.push(task.id)
      }
    }
    for (const taskId of tasksToCancel) {
      void this.cancelTask(taskId, { source: "stop-continuation", skipNotification: true })
    }
    return tasksToCancel.length
  }

  private startPolling(): void {
    if (this.pollingInterval) return

    this.pollingInterval = setInterval(() => {
      this.pollRunningTasks()
    }, POLLING_INTERVAL_MS)
    this.pollingInterval.unref()
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = undefined
    }
  }

  private registerProcessCleanup(): void {
    BackgroundManager.cleanupManagers.add(this)

    if (BackgroundManager.cleanupRegistered) return
    BackgroundManager.cleanupRegistered = true

    const cleanupAll = () => {
      for (const manager of BackgroundManager.cleanupManagers) {
        try {
          manager.shutdown()
        } catch (error) {
          log("[background-agent] Error during shutdown cleanup:", error)
        }
      }
    }

    const registerSignal = (signal: ProcessCleanupEvent, exitAfter: boolean): void => {
      const listener = registerProcessSignal(signal, cleanupAll, exitAfter)
      BackgroundManager.cleanupHandlers.set(signal, listener)
    }

    registerSignal("SIGINT", true)
    registerSignal("SIGTERM", true)
    if (process.platform === "win32") {
      registerSignal("SIGBREAK", true)
    }
    registerSignal("beforeExit", false)
    registerSignal("exit", false)
  }

  private unregisterProcessCleanup(): void {
    BackgroundManager.cleanupManagers.delete(this)

    if (BackgroundManager.cleanupManagers.size > 0) return

    for (const [signal, listener] of BackgroundManager.cleanupHandlers.entries()) {
      process.off(signal, listener)
    }
    BackgroundManager.cleanupHandlers.clear()
    BackgroundManager.cleanupRegistered = false
  }


  /**
   * Get all running tasks (for compaction hook)
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === "running")
  }

  /**
   * Get all non-running tasks still in memory (for compaction hook)
   */
  getNonRunningTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status !== "running")
  }

  /**
   * Safely complete a task with race condition protection.
   * Returns true if task was successfully completed, false if already completed by another path.
   */
  private async tryCompleteTask(task: BackgroundTask, source: string): Promise<boolean> {
    // Guard: Check if task is still running (could have been completed by another path)
    if (task.status !== "running") {
      log("[background-agent] Task already completed, skipping:", { taskId: task.id, status: task.status, source })
      return false
    }

    // Atomically mark as completed to prevent race conditions
    task.status = "completed"
    task.completedAt = new Date()

    // Compress result for handoff boundary (before persist so compactedResult is persisted)
    const hc = this.handoffCompression
    if (hc && hc.enabled !== false && task.sessionID) {
      try {
        const raw = await this.client.session.messages({ path: { id: task.sessionID } })
        let msgs: Array<{
          info?: { role?: string }
          parts?: Array<{ type?: string; text?: string }>
        }> = []
        if (Array.isArray(raw)) {
          msgs = raw
        } else if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as Record<string, unknown>).data)) {
          msgs = (raw as Record<string, unknown>).data as typeof msgs
        }
        const assistantMsgs = msgs.filter((m) => m.info?.role === "assistant")
        const maxMsgs = hc?.maxMessages ?? 6
        const keepFirst = hc?.keepFirst ?? 2
        const keepLast = hc?.keepLast ?? 3

        if (assistantMsgs.length > maxMsgs) {
          const first = assistantMsgs.slice(0, keepFirst)
          const last = assistantMsgs.slice(-keepLast)
          const extractText = (msgs: typeof assistantMsgs): string =>
            msgs
              .map((m) =>
                m.parts
                  ?.filter((p) => p.type === "text" || p.type === "reasoning")
                  .map((p) => p.text)
                  .filter(Boolean)
                  .join("\n") ?? "",
              )
              .filter(Boolean)
              .join("\n\n")
          const firstText = extractText(first)
          const lastText = extractText(last)
          const truncated = assistantMsgs.length - keepFirst - keepLast
          task.compactedResult = `${firstText}\n\n[... ${truncated} messages truncated]\n\n${lastText}`
        }
      } catch (err) {
        // Graceful fallback — compression failure should not break completion
        log("[background-agent] Handoff compression failed:", { taskId: task.id, error: err })
      }
    }

    this.persistHandle(task)
    this.disarmWallclock(task.id)
    this.taskHistory.record(task.parentSessionID, { id: task.id, sessionID: task.sessionID, agent: task.agent, description: task.description, status: "completed", category: task.category, startedAt: task.startedAt, completedAt: task.completedAt })

    // Release concurrency BEFORE any async operations to prevent slot leaks
    if (task.concurrencyKey) {
      this.concurrencyManager.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
    this.decrementNestedActive(task)

    this.markForNotification(task)

    // Ensure pending tracking is cleaned up even if notification fails
    this.cleanupPendingByParent(task)

    const idleTimer = this.idleDeferralTimers.get(task.id)
    if (idleTimer) {
      clearTimeout(idleTimer)
      this.idleDeferralTimers.delete(task.id)
    }

    if (task.sessionID) {
      this.abortSessionQuietly(task.sessionID, "complete")
    }

    try {
      await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
      log(`[background-agent] Task completed via ${source}:`, task.id)
      this.refreshParentWake(task.parentSessionID)
    } catch (err) {
      log("[background-agent] Error in notifyParentSession:", { taskId: task.id, error: err })
      // Concurrency already released, notification failed but task is complete
    }

    return true
  }

  private async notifyParentSession(task: BackgroundTask): Promise<void> {
    // Note: Callers must release concurrency before calling this method
    // to ensure slots are freed even if notification fails

    const duration = formatDuration(task.startedAt ?? new Date(), task.completedAt)

    log("[background-agent] notifyParentSession called for task:", task.id)

    // Show toast notification
    const toastManager = getTaskToastManager()
    if (toastManager) {
      toastManager.showCompletionToast({
        id: task.id,
        description: task.description,
        duration,
      })
    }

    // Update pending tracking and check if all tasks complete
    const pendingSet = this.pendingByParent.get(task.parentSessionID)
    let allComplete = false
    let remainingCount = 0
    if (pendingSet) {
      pendingSet.delete(task.id)
      remainingCount = pendingSet.size
      allComplete = remainingCount === 0
      if (allComplete) {
        this.pendingByParent.delete(task.parentSessionID)
      }
    } else {
      allComplete = true
    }

    const completedTasks = allComplete
      ? Array.from(this.tasks.values())
        .filter(t => t.parentSessionID === task.parentSessionID && t.status !== "running" && t.status !== "pending")
      : []

    const errorInfo = task.error ? `\n**Error:** ${task.error}` : ""

    const notification = buildCompletionNotification(
      task,
      allComplete,
      completedTasks,
      remainingCount,
      duration,
      errorInfo,
    )

    const { agent, model } = await resolveAgentAndModel(
      this.client,
      task,
      this.enableParentSessionNotifications,
    )

    log("[background-agent] notifyParentSession context:", {
      taskId: task.id,
      resolvedAgent: agent,
      resolvedModel: model,
    })

    if (this.enableParentSessionNotifications) {
      try {
        await this.client.session.promptAsync({
          path: { id: task.parentSessionID },
          body: {
            noReply: !allComplete,
            ...(agent !== undefined ? { agent } : {}),
            ...(model !== undefined ? { model } : {}),
            ...(task.parentTools ? { tools: task.parentTools } : {}),
            parts: [{ type: "text", text: notification }],
          },
        })
        log("[background-agent] Sent notification to parent session:", {
          taskId: task.id,
          allComplete,
          noReply: !allComplete,
        })
      } catch (error) {
        if (isAbortedSessionError(error)) {
          log("[background-agent] Parent session aborted while sending notification; continuing cleanup:", {
            taskId: task.id,
            parentSessionID: task.parentSessionID,
          })
        } else {
          log("[background-agent] Failed to send notification:", error)
        }
      }
    } else {
      log("[background-agent] Parent session notifications disabled, skipping prompt injection:", {
        taskId: task.id,
        parentSessionID: task.parentSessionID,
      })
    }

    if (allComplete) {
      for (const completedTask of completedTasks) {
        const taskId = completedTask.id
        const existingTimer = this.completionTimers.get(taskId)
        if (existingTimer) {
          clearTimeout(existingTimer)
          this.completionTimers.delete(taskId)
        }
        const timer = setTimeout(() => {
          this.completionTimers.delete(taskId)
          if (this.tasks.has(taskId)) {
            this.clearNotificationsForTask(taskId)
            this.tasks.delete(taskId)
            log("[background-agent] Removed completed task from memory:", taskId)
          }
        }, TASK_CLEANUP_DELAY_MS)
        this.completionTimers.set(taskId, timer)
      }
    }
  }

  private hasRunningTasks(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "running") return true
    }
    return false
  }

  private pruneStaleTasksAndNotifications(): void {
    const now = Date.now()

    for (const [taskId, task] of this.tasks.entries()) {
      const wasPending = task.status === "pending"
      const timestamp = task.status === "pending" 
        ? task.queuedAt?.getTime() 
        : task.startedAt?.getTime()
      
      if (!timestamp) {
        continue
      }
      
      const age = now - timestamp
      if (age > TASK_TTL_MS) {
        const errorMessage = task.status === "pending"
          ? "Task timed out while queued (30 minutes)"
          : "Task timed out after 30 minutes"
        
        log("[background-agent] Pruning stale task:", { taskId, status: task.status, age: `${Math.round(age / 1000)}s` })
        task.status = "error"
        task.error = errorMessage
        task.completedAt = new Date()
        this.persistHandle(task)
        this.disarmWallclock(task.id)
        if (task.concurrencyKey) {
          this.concurrencyManager.release(task.concurrencyKey)
          task.concurrencyKey = undefined
        }
        this.decrementNestedActive(task)
        // Clean up pendingByParent to prevent stale entries
        this.cleanupPendingByParent(task)
        if (wasPending) {
          const key = task.model
            ? `${task.model.providerID}/${task.model.modelID}`
            : task.agent
          const queue = this.queuesByKey.get(key)
          if (queue) {
            const index = queue.findIndex((item) => item.task.id === taskId)
            if (index !== -1) {
              queue.splice(index, 1)
              if (queue.length === 0) {
                this.queuesByKey.delete(key)
              }
            }
          }
        }
        this.clearNotificationsForTask(taskId)
        const toastManager = getTaskToastManager()
        if (toastManager) {
          toastManager.removeTask(taskId)
        }
        this.tasks.delete(taskId)
        if (task.sessionID) {
          unregisterSubagentSession(task.sessionID)
        }
      }
    }

    for (const [sessionID, notifications] of this.notifications.entries()) {
      if (notifications.length === 0) {
        this.notifications.delete(sessionID)
        continue
      }
      const validNotifications = notifications.filter((task) => {
        if (!task.startedAt) return false
        const age = now - task.startedAt.getTime()
        return age <= TASK_TTL_MS
      })
      if (validNotifications.length === 0) {
        this.notifications.delete(sessionID)
      } else if (validNotifications.length !== notifications.length) {
        this.notifications.set(sessionID, validNotifications)
      }
    }

    // Full sweep: any remaining nested-admission bookkeeping is stale.
    this.nestedActive.clear()
    this.nestedBypassTaskIds.clear()
  }

  /**
   * True when the subagent session is awaiting user input (unanswered question).
   * The reaper must not kill a task that is legitimately waiting for an answer:
   * its session reports idle and it stops posting progress, but it is not stuck.
   * Ground truth comes from the session message history (hasPendingQuestionMessage);
   * on fetch failure we fail open (return false) so reaping behavior is unchanged.
   */
  private async isSessionAwaitingUser(sessionID: string): Promise<boolean> {
    try {
      const resp = await this.client.session.messages({
        path: { id: sessionID },
        query: { directory: this.directory },
      })
      return hasPendingQuestionMessage(normalizeSDKResponse(resp, [] as Array<unknown>))
    } catch (err) {
      log("[background-agent] isSessionAwaitingUser check failed:", { sessionID, error: err })
      return false
    }
  }

  private async checkAndInterruptStaleTasks(
    allStatuses: Record<string, { type: string }> = {},
  ): Promise<void> {
    const staleTimeoutMs = this.config?.staleTimeoutMs ?? DEFAULT_STALE_TIMEOUT_MS
    const messageStalenessMs = this.config?.messageStalenessTimeoutMs ?? DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS
    const now = Date.now()

    for (const task of this.tasks.values()) {
      if (task.status !== "running") continue

      const startedAt = task.startedAt
      const sessionID = task.sessionID
      if (!startedAt || !sessionID) continue

      const sessionStatus = allStatuses[sessionID]?.type
      const sessionIsRunning = sessionStatus !== undefined && sessionStatus !== "idle"
      const runtime = now - startedAt.getTime()

      if (!task.progress?.lastUpdate) {
        if (sessionIsRunning) continue
        if (runtime <= messageStalenessMs) continue
        if (await this.isSessionAwaitingUser(sessionID)) continue

        const staleMinutes = Math.round(runtime / 60000)
        task.status = "cancelled"
        task.error = `Stale timeout (no activity for ${staleMinutes}min since start)`
        task.completedAt = new Date()
        this.persistHandle(task)
        this.disarmWallclock(task.id)

        if (task.concurrencyKey) {
          this.concurrencyManager.release(task.concurrencyKey)
          task.concurrencyKey = undefined
        }
        this.decrementNestedActive(task)

        this.abortSessionQuietly(sessionID, "stale-no-progress")
        log(`[background-agent] Task ${task.id} interrupted: no progress since start`)

        try {
          await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
        } catch (err) {
          log("[background-agent] Error in notifyParentSession for stale task:", { taskId: task.id, error: err })
        }
        continue
      }

      if (sessionIsRunning) continue

      if (runtime < MIN_RUNTIME_BEFORE_STALE_MS) continue

      const timeSinceLastUpdate = now - task.progress.lastUpdate.getTime()
      if (timeSinceLastUpdate <= staleTimeoutMs) continue
      if (await this.isSessionAwaitingUser(sessionID)) continue
      if (task.status !== "running") continue

      const staleMinutes = Math.round(timeSinceLastUpdate / 60000)
      task.status = "cancelled"
      task.error = `Stale timeout (no activity for ${staleMinutes}min)`
      task.completedAt = new Date()
      this.persistHandle(task)
      this.disarmWallclock(task.id)

      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }
      this.decrementNestedActive(task)

      this.abortSessionQuietly(sessionID, "stale-timeout")
      log(`[background-agent] Task ${task.id} interrupted: stale timeout`)

      try {
        await this.enqueueNotificationForParent(task.parentSessionID, () => this.notifyParentSession(task))
      } catch (err) {
        log("[background-agent] Error in notifyParentSession for stale task:", { taskId: task.id, error: err })
      }
    }
  }

  private async pollRunningTasks(): Promise<void> {
    if (this.pollingInFlight) return
    this.pollingInFlight = true
    try {
    // Throttle prune to once per PRUNE_THROTTLE_MS. Stale tasks age out at
    // TASK_TTL_MS (30 minutes), so a 30s cadence is 60× the minimum useful
    // frequency and saves ~9 of every 10 prune invocations when polling
    // runs every POLLING_INTERVAL_MS (3s). The check lives here (not inside
    // pruneStaleTasksAndNotifications) so the function stays pure and
    // testable in isolation.
    if (Date.now() - this.lastPruneAt >= PRUNE_THROTTLE_MS) {
      this.pruneStaleTasksAndNotifications()
      this.lastPruneAt = Date.now()
    }

    const statusResult = await this.client.session.status()
    const allStatuses = normalizeSDKResponse(statusResult, {} as Record<string, { type: string }>)

    await this.checkAndInterruptStaleTasks(allStatuses)

    for (const task of this.tasks.values()) {
      if (task.status !== "running") continue
      
      const sessionID = task.sessionID
      if (!sessionID) continue

      try {
        const sessionStatus = allStatuses[sessionID]
        
        if (sessionStatus?.type === "idle") {
          // Edge guard: Validate session has actual output before completing
          const hasValidOutput = await this.validateSessionHasOutput(sessionID)
          if (!hasValidOutput) {
            log("[background-agent] Polling idle but no valid output yet, waiting:", task.id)
            continue
          }

          // Re-check status after async operation
          if (task.status !== "running") continue

          const hasIncompleteTodos = await this.checkSessionTodos(sessionID)
          if (hasIncompleteTodos) {
            log("[background-agent] Task has incomplete todos via polling, waiting:", task.id)
            continue
          }

          await this.tryCompleteTask(task, "polling (idle status)")
          continue
        }

        // Session is still actively running (not idle).
        // Progress is already tracked via handleEvent(message.part.updated),
        // so we skip the expensive session.messages() fetch here.
        // Completion will be detected when session transitions to idle.
        log("[background-agent] Session still running, relying on event-based progress:", {
          taskId: task.id,
          sessionID,
          sessionStatus: sessionStatus?.type ?? "not_in_status",
          toolCalls: task.progress?.toolCalls ?? 0,
        })
      } catch (error) {
        log("[background-agent] Poll error for task:", { taskId: task.id, error })
      }
    }

    if (!this.hasRunningTasks()) {
      this.stopPolling()
    }
    } finally {
      this.pollingInFlight = false
    }
  }

  /**
   * Shutdown the manager gracefully.
   * Cancels all pending concurrency waiters and clears timers.
   * Should be called when the plugin is unloaded.
   */
  shutdown(): void {
    if (this.shutdownTriggered) return
    this.shutdownTriggered = true
    log("[background-agent] Shutting down BackgroundManager")
    this.stopPolling()

    // Abort all running sessions to prevent zombie processes (#1240)
    for (const task of this.tasks.values()) {
      if (task.status === "running" && task.sessionID) {
        this.abortSessionQuietly(task.sessionID, "shutdown")
      }
    }

    // Notify shutdown listeners (e.g., tmux cleanup)
    if (this.onShutdown) {
      try {
        this.onShutdown()
      } catch (error) {
        log("[background-agent] Error in onShutdown callback:", error)
      }
    }

    // Release concurrency for all running tasks
    for (const task of this.tasks.values()) {
      if (task.concurrencyKey) {
        this.concurrencyManager.release(task.concurrencyKey)
        task.concurrencyKey = undefined
      }
    }

    for (const timer of this.completionTimers.values()) {
      clearTimeout(timer)
    }
    this.completionTimers.clear()

    for (const timer of this.idleDeferralTimers.values()) {
      clearTimeout(timer)
    }
    this.idleDeferralTimers.clear()
    this.wakeScheduler.dispose()
    this.wallclock.disarmAll()
    for (const timer of this.wallclockGraceTimers.values()) {
      clearTimeout(timer)
    }
    this.wallclockGraceTimers.clear()

    this.concurrencyManager.clear()
    this.tasks.clear()
    this.notifications.clear()
    this.pendingByParent.clear()
    this.notificationQueueByParent.clear()
    this.queuesByKey.clear()
    this.processingKeys.clear()
    this.nestedActive.clear()
    this.nestedBypassTaskIds.clear()
    this.unregisterProcessCleanup()
    log("[background-agent] Shutdown complete")

  }

  private enqueueNotificationForParent(
    parentSessionID: string | undefined,
    operation: () => Promise<void>
  ): Promise<void> {
    if (!parentSessionID) {
      return operation()
    }

    const previous = this.notificationQueueByParent.get(parentSessionID) ?? Promise.resolve()
    const current = previous
      .catch((err) => {
        log("[background-agent] Previous notification failed, continuing queue:", err)
      })
      .then(operation)

    this.notificationQueueByParent.set(parentSessionID, current)

    void current.finally(() => {
      if (this.notificationQueueByParent.get(parentSessionID) === current) {
        this.notificationQueueByParent.delete(parentSessionID)
      }
    }).catch((err) => {
      log("[background-agent] Notification queue cleanup failed:", err)
    })

    return current
  }
}

function registerProcessSignal(
  signal: ProcessCleanupEvent,
  handler: () => void,
  exitAfter: boolean
): () => void {
  const listener = () => {
    handler()
    if (exitAfter) {
      // Set exitCode and schedule exit after delay to allow other handlers to complete async cleanup
      // Use 6s delay to accommodate LSP cleanup (5s timeout + 1s SIGKILL wait)
      process.exitCode = 0
      setTimeout(() => process.exit(), 6000)
    }
  }
  process.on(signal, listener)
  return listener
}


export function _resetPruneThrottleForTesting(): void {
  // Access the private static instance set via a typed cast — `private static`
  // is a per-class visibility modifier, so a module-level function in the
  // same file needs the cast to read it. Mirrors the _resetMessageDirCacheForTesting
  // pattern: a thin module-level export that resets module/instance state for
  // test isolation.
  const instances = (BackgroundManager as unknown as {
    cleanupManagers: Set<BackgroundManager>
  }).cleanupManagers
  for (const m of instances) {
    ;(m as unknown as { lastPruneAt: number }).lastPruneAt = 0
  }
}
