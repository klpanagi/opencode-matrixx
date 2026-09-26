import { copyFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { log } from "../shared/logger"

export interface OpenCodeCliConfigPath {
  path: string
  format: "json" | "jsonc" | "none"
  source: "cli" | "tui" | "default"
}

export interface OpenCodeCliConfigMigration {
  migrated: boolean
  action: "copied" | "skipped-existing" | "skipped-absent" | "failed"
  path: string
  format: "json" | "jsonc" | "none"
  source: "cli" | "tui" | "default"
  error?: string
}

/**
 * Resolve OpenCode's own CLI config path across the V1→V2 `tui.json` → `cli.json`
 * rename. Recognizes both names and prefers the V2-canonical `cli.json`; when
 * neither exists the default V2 path is returned.
 */
export function resolveOpencodeCliConfigPath(configDir: string): OpenCodeCliConfigPath {
  const cliJsonc = join(configDir, "cli.jsonc")
  if (existsSync(cliJsonc)) return { path: cliJsonc, format: "jsonc", source: "cli" }

  const cliJson = join(configDir, "cli.json")
  if (existsSync(cliJson)) return { path: cliJson, format: "json", source: "cli" }

  const tuiJsonc = join(configDir, "tui.jsonc")
  if (existsSync(tuiJsonc)) return { path: tuiJsonc, format: "jsonc", source: "tui" }

  const tuiJson = join(configDir, "tui.json")
  if (existsSync(tuiJson)) return { path: tuiJson, format: "json", source: "tui" }

  return { path: cliJson, format: "none", source: "default" }
}

function v2TargetFor(resolved: OpenCodeCliConfigPath): string {
  return resolved.path.replace(/tui\./, "cli.")
}

/**
 * Materialize the V2-canonical `cli.json(c)` from a legacy `tui.json(c)`.
 *
 * This COPIES rather than renames on purpose: OpenCode V1 still reads
 * `tui.json`, and the plan keeps V1 runnable until the Wave 10 gate. A rename
 * would silently un-configure every V1 session. The copy is skipped entirely
 * when a `cli.json(c)` already exists, so a user's V2 file is never clobbered,
 * which also makes the call idempotent.
 */
export function migrateOpencodeCliConfig(configDir: string): OpenCodeCliConfigMigration {
  const resolved = resolveOpencodeCliConfigPath(configDir)

  if (resolved.source === "cli") {
    return { migrated: false, action: "skipped-existing", ...resolved };
  }
  if (resolved.source !== "tui") {
    return { migrated: false, action: "skipped-absent", ...resolved };
  }

  const target = v2TargetFor(resolved);
  if (existsSync(target)) {
    return { migrated: false, action: "skipped-existing", ...resolved };
  }

  try {
    copyFileSync(resolved.path, target);
    log("[opencode-cli-config] copied legacy tui config to cli", {
      from: resolved.path,
      to: target,
    });
    return { migrated: true, action: "copied", ...resolved, path: target };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("[opencode-cli-config] legacy tui config migration failed", { error: message });
    return {
      migrated: false,
      action: "failed",
      ...resolved,
      error: message,
    };
  }
}
