import type { BackgroundTaskConfig } from "../../config/schema"

export type AcquireOutcome =
  | { granted: true }
  | { granted: false; reason: "timeout" | "cancelled"; waitedMs: number }

/**
 * Queue entry with settled-flag pattern to prevent double-resolution.
 *
 * The settled flag ensures that cancelWaiters() doesn't reject
 * an entry that was already resolved by release().
 */
interface QueueEntry {
  settle: (outcome: AcquireOutcome) => void
  settled: boolean
  enqueuedAt: number
}

export class ConcurrencyManager {
  private config?: BackgroundTaskConfig
  private counts: Map<string, number> = new Map()
  private queues: Map<string, QueueEntry[]> = new Map()

  constructor(config?: BackgroundTaskConfig) {
    this.config = config
  }

  getConcurrencyLimit(model: string): number {
    const modelLimit = this.config?.modelConcurrency?.[model]
    if (modelLimit !== undefined) {
      return modelLimit === 0 ? Infinity : modelLimit
    }
    const provider = model.split('/')[0]
    const providerLimit = this.config?.providerConcurrency?.[provider]
    if (providerLimit !== undefined) {
      return providerLimit === 0 ? Infinity : providerLimit
    }
    const defaultLimit = this.config?.defaultConcurrency
    if (defaultLimit !== undefined) {
      return defaultLimit === 0 ? Infinity : defaultLimit
    }
    return 5
  }

  private tryAcquireSlot(model: string): boolean {
    const limit = this.getConcurrencyLimit(model)
    if (limit === Infinity) {
      return true
    }
    const current = this.counts.get(model) ?? 0
    if (current < limit) {
      this.counts.set(model, current + 1)
      return true
    }
    return false
  }

  async acquire(model: string): Promise<void> {
    if (this.tryAcquireSlot(model)) return
    const outcome = await this.acquireWithDeadline(model, undefined)
    if (outcome.granted) return
    if (outcome.reason === "cancelled") {
      throw new Error(`Concurrency queue cancelled for model: ${model}`)
    }
  }

  async acquireWithDeadline(model: string, timeoutMs?: number): Promise<AcquireOutcome> {
    if (this.tryAcquireSlot(model)) {
      return { granted: true }
    }

    return new Promise<AcquireOutcome>((resolve) => {
      const queue = this.queues.get(model) ?? []
      let timer: ReturnType<typeof setTimeout> | undefined

      const entry: QueueEntry = {
        settled: false,
        enqueuedAt: Date.now(),
        settle: (outcome) => {
          if (entry.settled) return
          entry.settled = true
          if (timer !== undefined) clearTimeout(timer)
          resolve(outcome)
        },
      }

      queue.push(entry)
      this.queues.set(model, queue)

      if (timeoutMs === undefined || timeoutMs <= 0) return

      timer = setTimeout(() => {
        if (entry.settled) return
        entry.settled = true
        const pending = this.queues.get(model)
        if (pending) {
          const index = pending.indexOf(entry)
          if (index !== -1) pending.splice(index, 1)
        }
        resolve({ granted: false, reason: "timeout", waitedMs: Date.now() - entry.enqueuedAt })
      }, timeoutMs)
    })
  }

  release(model: string): void {
    const limit = this.getConcurrencyLimit(model)
    if (limit === Infinity) {
      return
    }

    const queue = this.queues.get(model)

    // Try to hand off to a waiting entry (skip any settled entries from cancelWaiters)
    while (queue && queue.length > 0) {
      const next = queue.shift()
      if (!next) continue
      if (!next.settled) {
        // Hand off the slot to this waiter (count stays the same)
        next.settle({ granted: true })
        return
      }
    }

    // No handoff occurred - decrement the count to free the slot
    const current = this.counts.get(model) ?? 0
    if (current > 0) {
      this.counts.set(model, current - 1)
    }
  }

  /**
   * Cancel all waiting acquires for a model. Used during cleanup.
   */
  cancelWaiters(model: string): void {
    const queue = this.queues.get(model)
    if (queue) {
      const now = Date.now()
      for (const entry of queue) {
        entry.settle({ granted: false, reason: "cancelled", waitedMs: now - entry.enqueuedAt })
      }
      this.queues.delete(model)
    }
  }

  /**
   * Clear all state. Used during manager cleanup/shutdown.
   * Cancels all pending waiters.
   */
  clear(): void {
    for (const [model] of this.queues) {
      this.cancelWaiters(model)
    }
    this.counts.clear()
    this.queues.clear()
  }

  /**
   * Get current count for a model (for testing/debugging)
   */
  getCount(model: string): number {
    return this.counts.get(model) ?? 0
  }

  /**
   * Get queue length for a model (for testing/debugging)
   */
  getQueueLength(model: string): number {
    return this.queues.get(model)?.length ?? 0
  }
}
