import { z } from "zod"

export const BuiltinCommandNameSchema = z.enum([
  "init-deep",
  "matrix-loop",
  "ulw-loop",
  "cancel-loop",
  "refactor",
  "start-work",
  "stop-continuation",
  "preset",
  "end-ultrawork",
  "handoff",
  "research",
  "assembly",
  "ultrawork",
  "bdd-pipeline",
])

export type BuiltinCommandName = z.infer<typeof BuiltinCommandNameSchema>
