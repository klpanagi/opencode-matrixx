import type { CommandDefinition } from "../command-loader"

export type BuiltinCommandName = "init-deep" | "matrix-loop" | "cancel-loop" | "ulw-loop" | "refactor" | "start-work" | "stop-continuation" | "handoff" | "pickup" | "remove-deadcode" | "preset" | "end-ultrawork" | "research" | "assembly" | "ultrawork" | "bdd-pipeline" | "evolution" | "cleanup-tasks" | "task-list"

export type BuiltinCommands = Record<string, CommandDefinition>
