import { log } from "../../shared"
import { createSensitiveFileMatcher } from "./sensitive-file-matcher"

interface EnvFileWriteGuardOptions {
  enabled?: boolean
  blocked_patterns?: string[]
  allowed_paths?: string[]
}

export function createEnvFileWriteGuardHook(config?: EnvFileWriteGuardOptions) {
  const enabled = config?.enabled ?? true
  const isSensitive = createSensitiveFileMatcher(
    config?.blocked_patterns,
    config?.allowed_paths,
  )

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ): Promise<void> => {
      if (!enabled) return

      const toolLower = input.tool.toLowerCase()
      if (toolLower !== "write" && toolLower !== "edit" && toolLower !== "multiedit") {
        return
      }

      const filePath = (output.args.filePath ?? output.args.file_path ?? output.args.path) as string | undefined
      if (!filePath) return

      if (isSensitive(filePath)) {
        log("[env-file-write-guard] BLOCKED write to sensitive file", {
          sessionID: input.sessionID,
          filePath,
        })

        throw new Error(
          `🔒 SENSITIVE FILE GUARD — write blocked.\n\n` +
          `File "${filePath}" matches a sensitive file pattern (.env, .pem, .key, credentials, etc.).\n` +
          `Writing secrets directly to files is forbidden.\n\n` +
          `Instead:\n` +
          `  - Use environment variables for API keys and tokens\n` +
          `  - Use placeholder values (e.g., "YOUR_API_KEY_HERE") in example configs\n` +
          `  - Add sensitive files to .gitignore`
        )
      }
    },
  }
}
