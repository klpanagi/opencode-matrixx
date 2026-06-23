import { z } from "zod"

const MESSAGE_KINDS = [
  "message",
  "shutdown_request",
  "shutdown_approved",
  "shutdown_rejected",
  "announcement",
] as const

const TASK_STATUSES = ["pending", "claimed", "in_progress", "completed", "deleted"] as const

const MemberBaseSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/),
  cwd: z.string().optional(),
  worktreePath: z.string().optional(),
  subscriptions: z.array(z.string()).optional(),
  backendType: z.enum(["in-process", "tmux"]).default("in-process"),
  color: z.string().optional(),
  isActive: z.boolean().default(true),
}).strict()

export const CategoryMemberSchema = MemberBaseSchema.extend({
  kind: z.literal("category"),
  category: z.string().min(1),
  prompt: z.string().min(1),
})

export const SubagentMemberSchema = MemberBaseSchema.extend({
  kind: z.literal("subagent_type"),
  subagent_type: z.string().min(1),
  prompt: z.string().optional(),
})

export const MemberSchema = z.discriminatedUnion("kind", [CategoryMemberSchema, SubagentMemberSchema])

const TeamReferenceSchema = z.object({
  path: z.string(),
  description: z.string().optional(),
}).strict()

const MessageSchema = z.object({
  version: z.literal(1),
  messageId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(MESSAGE_KINDS),
  body: z.string().max(32 * 1024),
  summary: z.string().optional(),
  references: z.array(TeamReferenceSchema).optional(),
  timestamp: z.number().int().positive(),
  correlationId: z.string().uuid().optional(),
  color: z.string().optional(),
})

export const TaskSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  activeForm: z.string().optional(),
  status: z.enum(TASK_STATUSES),
  owner: z.string().optional(),
  blocks: z.array(z.string()).default([]),
  blockedBy: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  claimedAt: z.number().int().positive().optional(),
})

export const AGENT_ELIGIBILITY_REGISTRY: Readonly<Record<string, {
  verdict: "eligible" | "conditional" | "hard-reject"
  rejectionMessage?: string
}>> = {
  morpheus: { verdict: "eligible" },
  keymaker: { verdict: "eligible" },
  architect: { verdict: "eligible" },
  cipher: { verdict: "eligible" },
  oracle: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'oracle' is read-only (strategic planner). Team members must write to mailbox inbox files. Use delegate-task with subagent_type: 'oracle' for read-only analysis instead.",
  },
  merovingian: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'merovingian' is read-only (consultation/debugging). Cannot write to mailbox as team member. Use delegate-task for consultation queries instead.",
  },
  operator: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'operator' is read-only (docs/GitHub search). Cannot write to mailbox as team member. Use delegate-task for documentation queries instead.",
  },
  trinity: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'trinity' is read-only (codebase grep). Cannot write to mailbox as team member. Use delegate-task for codebase exploration instead.",
  },
  seraph: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'seraph' is read-only (pre-planning analysis). Cannot write to mailbox as team member. Use delegate-task for pre-planning analysis instead.",
  },
  smith: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'smith' is read-only (plan validator). Cannot write to mailbox as team member. Use delegate-task for plan validation instead.",
  },
  sentinel: {
    verdict: "hard-reject",
    rejectionMessage:
      "Agent 'sentinel' is read-only (security auditor). Cannot write to mailbox as team member. Use delegate-task for security analysis instead.",
  },
} as const

export type Message = z.infer<typeof MessageSchema>
export type Task = z.infer<typeof TaskSchema>
