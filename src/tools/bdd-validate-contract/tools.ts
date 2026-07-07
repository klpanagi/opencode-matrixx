import * as fs from "node:fs"
import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import { ContractSchema } from "../../features/bdd/schema"

/**
 * The bdd_validate_contract tool reads a contract JSON from disk and
 * validates it against the strict ContractSchema. It is the single source
 * of truth for what a valid contract looks like.
 *
 * Use this tool:
 *   - After the bdd-contract agent edits a contract file in any way
 *     (read-back-then-validate is the only way to be sure the on-disk
 *     bytes conform to the schema).
 *   - In a CI gate that re-validates every contract in the repo.
 *   - Whenever the bdd-pipeline runs as a pre-flight check before
 *     bdd-frontend / bdd-backend / bdd-tests phase starts.
 *
 * Returns:
 *   { success: true, contract }            -- when validation passes
 *   { success: false, errors: <ZodFlatten> } -- when validation fails
 *   { success: false, error: <string> }    -- when the file is missing,
 *                                             unreadable, or not JSON
 */
export function createBddValidateContractTool(): ToolDefinition {
  return tool({
    description:
      "Read a contract JSON file from disk and validate it against " +
      "ContractSchema. Returns { success, contract } on pass or " +
      "{ success: false, errors } (Zod flatten shape) on schema failure, " +
      "or { success: false, error } on missing/malformed file. " +
      "Use after every create or edit of a contract file -- the bdd-contract " +
      "agent MUST call this after writing annotations to be sure the " +
      "on-disk JSON conforms to the strict schema.",
    args: {
      contractPath: tool.schema
        .string()
        .describe("Path to the contract JSON file to validate"),
    },
    async execute(args): Promise<string> {
      try {
        const contractPath = args.contractPath as string
        if (!fs.existsSync(contractPath)) {
          return JSON.stringify({
            success: false,
            error: `Contract file not found: ${contractPath}`,
          })
        }
        const raw = fs.readFileSync(contractPath, "utf-8")
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch (e) {
          return JSON.stringify({
            success: false,
            error: `Contract file is not valid JSON: ${(e as Error).message}`,
          })
        }
        const result = ContractSchema.safeParse(parsed)
        if (!result.success) {
          return JSON.stringify({
            success: false,
            errors: result.error.flatten(),
          })
        }
        return JSON.stringify({
          success: true,
          contract: result.data,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return JSON.stringify({ success: false, error: message })
      }
    },
  })
}
