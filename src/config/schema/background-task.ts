import { z } from "zod"

const CircuitBreakerConfigSchema = z.object({
  enabled: z.boolean().optional(),
  maxToolCalls: z.number().int().min(10).optional(),
  consecutiveThreshold: z.number().int().min(5).optional(),
})

const NestedAdmissionConfigSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["bypass", "reserve"]).optional(),
  maxDepth: z.number().int().min(1).max(5).optional(),
})

/** Idle-parent wake scheduler settings (default ON, default interval 300000ms, minimum 60000ms) */
export const WakeSchedulerConfigSchema = z.object({
  enabled: z.boolean().optional(),
  intervalMs: z.number().min(60000).optional(),
})

/** Job-board snapshot settings (defaults: enabled true, strategy "latest", maxRetainedSnapshots 20) */
export const JobBoardConfigSchema = z.object({
  enabled: z.boolean().optional(),
  strategy: z.enum(["latest", "checkpoint-compatible"]).optional(),
  maxRetainedSnapshots: z.number().int().min(1).max(100).optional(),
})

export const BackgroundTaskConfigSchema = z.object({
  defaultConcurrency: z.number().min(1).optional(),
  providerConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  modelConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  /** Stale timeout in milliseconds - interrupt tasks with no activity for this duration (default: 180000 = 3 minutes, minimum: 60000 = 1 minute) */
  staleTimeoutMs: z.number().min(60000).optional(),
  /** Timeout for tasks that never received any progress update, falling back to startedAt (default: 600000 = 10 minutes, minimum: 60000 = 1 minute) */
  messageStalenessTimeoutMs: z.number().min(60000).optional(),
  /** Shorthand for circuitBreaker.maxToolCalls */
  maxToolCalls: z.number().int().min(10).optional(),
  /** Circuit breaker settings to prevent runaway background tasks */
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
  /** Queue admission timeout in ms. 0 = unbounded (current behavior). Otherwise minimum 60000. */
  admissionTimeoutMs: z.union([z.literal(0), z.number().min(60000)]).optional(),
  /** Nested-task admission exemption (prevents self-deadlock when a managed child spawns background work). */
  nestedAdmission: NestedAdmissionConfigSchema.optional(),
  /** Idle-parent wake scheduler settings (default ON; see WakeSchedulerConfigSchema). */
  wakeScheduler: WakeSchedulerConfigSchema.optional(),
  /** Job-board snapshot settings (defaults true/latest/20; see JobBoardConfigSchema). */
  jobBoard: JobBoardConfigSchema.optional(),
})

export type BackgroundTaskConfig = z.infer<typeof BackgroundTaskConfigSchema>
