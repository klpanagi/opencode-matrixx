import type { CommandDefinition } from "../command-loader"

export type BuiltinCommandName = "init-deep" | "matrix-loop" | "cancel-loop" | "ulw-loop" | "refactor" | "start-work" | "stop-continuation" | "handoff" | "pickup" | "remove-deadcode" | "profile" | "end-ultrawork" | "research" | "assembly" | "ultrawork" | "bdd-backend" | "bdd-contract" | "bdd-frontend" | "bdd-pipeline" | "bdd-tests" | "dcp-profile"
export type BuiltinCommands = Record<string, CommandDefinition>
