import { invoke } from "@tauri-apps/api/core";

export interface BackupInfo {
  path: string;
  index: number;
  timestamp: string;
}

const BACKUP_EXT = ".bak";

function backupPath(filePath: string, index: number): string {
  return `${filePath}${BACKUP_EXT}.${index}`;
}

/**
 * Create a numbered backup of the given file.
 * Returns the backup file path.
 */
export async function createBackup(filePath: string): Promise<string> {
  const backups = await listBackups(filePath);
  const nextIndex =
    backups.length > 0 ? Math.max(...backups.map((b) => b.index)) + 1 : 1;
  const dest = backupPath(filePath, nextIndex);

  try {
    const content: string = await invoke("read_config", { path: filePath });
    await invoke("write_config", { path: dest, content });
    return dest;
  } catch (err) {
    throw new Error(`Backup failed for ${filePath}: ${String(err)}`);
  }
}

/**
 * List existing backups for a file, sorted by index ascending.
 */
export async function listBackups(filePath: string): Promise<BackupInfo[]> {
  // In Tauri, we need a custom command to list files. For now, we
  // attempt to read each expected backup and collect existing ones.
  // A dedicated 'list_backups' Rust command would be more efficient.
  const backups: BackupInfo[] = [];
  let index = 1;

  // Probe up to 10 backup slots
  while (index <= 10) {
    const path = backupPath(filePath, index);
    try {
      const content: string = await invoke("read_config", { path });
      if (content !== undefined) {
        backups.push({ path, index, timestamp: new Date().toISOString() });
      }
    } catch {
      break;
    }
    index++;
  }

  return backups;
}

/**
 * Remove backups exceeding `keepCount`, keeping the most recent ones.
 */
export async function cleanOldBackups(
  filePath: string,
  keepCount = 3,
): Promise<void> {
  const backups = await listBackups(filePath);
  if (backups.length <= keepCount) return;

  const toRemove = backups.slice(0, backups.length - keepCount);

  for (const backup of toRemove) {
    try {
      // Write empty content to effectively remove (Tauri v2 has no delete command)
      await invoke("write_config", { path: backup.path, content: "" });
    } catch {
      // Silently skip — cleanup is best-effort
    }
  }
}

/**
 * Restore the most recent backup over the original file.
 * Returns true if a backup was restored, false if none exist.
 */
export async function undoBackup(filePath: string): Promise<boolean> {
  const backups = await listBackups(filePath);
  if (backups.length === 0) return false;

  const latest = backups[backups.length - 1]!;
  try {
    const content: string = await invoke("read_config", { path: latest.path });
    if (!content) return false;
    await invoke("write_config", { path: filePath, content });
    return true;
  } catch {
    return false;
  }
}
