import { realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve } from "node:path";

/**
 * Normalize a directory for string comparison. Resolves symlinks via
 * `realpathSync` (guarded: falls back to lexical normalize for missing
 * paths), resolves relative paths against cwd, strips one trailing slash
 * except for the filesystem root. Never throws.
 */
export function normalizeDirForCompare(dir: string): string {
  const absolute = isAbsolute(dir) ? normalize(dir) : resolve(dir);
  let resolved: string;
  try {
    resolved = realpathSync(absolute);
  } catch {
    resolved = absolute;
  }
  if (resolved.length > 1 && resolved.endsWith("/")) {
    return resolved.slice(0, -1);
  }
  return resolved;
}
