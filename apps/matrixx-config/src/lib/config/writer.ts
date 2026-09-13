import { invoke } from "@tauri-apps/api/core";

import { readConfigFile } from "./reader";
import { type ValidationError, validateConfig } from "./validator";
import {
  type JsoncParseResult,
  parseJsoncSafe,
  stringifyJsonc,
} from "./utils/jsonc";
import { cleanOldBackups, createBackup } from "./utils/backup";

export interface WriteResult {
  success: boolean;
  errors: ValidationError[];
  backupPath?: string;
}

/**
 * Validate a configuration object, create a backup of the existing file,
 * then write the new content to disk via Tauri.
 *
 * Flow:
 * 1. Validate `data` against the schema
 * 2. Read existing file content for backup
 * 3. Create a numbered backup (.bak.N)
 * 4. Clean old backups (keep last 3)
 * 5. Serialize and write via Tauri invoke
 */
export async function writeConfigFile(
  path: string,
  data: Record<string, unknown>,
): Promise<WriteResult> {
  // Step 1: Validate
  const validation = validateConfig(data);
  if (!validation.ok) {
    return { success: false, errors: validation.errors };
  }

  let backupPath: string | undefined;

  try {
    // Step 2: Create backup of existing file
    backupPath = await createBackup(path);

    // Step 3: Clean old backups
    await cleanOldBackups(path, 3);
  } catch {
    // Backup is best-effort — continue with write
  }

  try {
    // Step 4: Serialize and write
    const content = stringifyJsonc(data, { indent: 2, trailingComma: true });
    await invoke("write_config", { path, content });

    const result: WriteResult = { success: true, errors: [] };
    if (backupPath) result.backupPath = backupPath;
    return result;
  } catch (err) {
    const result: WriteResult = {
      success: false,
      errors: [{ path: "", message: `Write failed: ${String(err)}` }],
    };
    if (backupPath) result.backupPath = backupPath;
    return result;
  }
}

/**
 * Read an existing JSONC file, merge new values into it (preserving comments),
 * validate the merged result, and write it back.
 */
export async function mergeAndWriteConfigFile(
  path: string,
  patch: Record<string, unknown>,
): Promise<WriteResult> {
  // Step 1: Read existing config
  const existing = await readConfigFile<Record<string, unknown>>(path);

  // Step 2: Merge (existing data or fresh object)
  const merged: Record<string, unknown> = existing.data
    ? deepMerge(existing.data, patch)
    : { ...patch };

  // Step 3: Validate merged result
  const validation = validateConfig(merged);
  if (!validation.ok) {
    return { success: false, errors: validation.errors };
  }

  // Step 4: Write
  return writeConfigFile(path, merged);
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) {
      delete result[key];
      continue;
    }

    const existing = result[key];

    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
