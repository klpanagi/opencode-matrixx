import { dirname } from "node:path";

function normalize(dir: string): string {
  return dir.endsWith("/") && dir.length > 1 ? dir.slice(0, -1) : dir;
}

/**
 * Single upward walk from the file's directory toward the filesystem root.
 * Visits each ancestor exactly once (leaf-first) and reports visits via onVisit.
 * rootDir/projectRoot only document the shared prefix — the walk itself is one loop.
 */
export function collectAncestorDirs(
  filePath: string,
  rootDir?: string | ((dir: string) => void),
  projectRoot?: string | ((dir: string) => void) | null,
  onVisit?: (dir: string) => void,
): string[] {
  let visit: ((dir: string) => void) | undefined;
  if (typeof rootDir === "function") visit = rootDir;
  else if (typeof projectRoot === "function") visit = projectRoot;
  if (typeof onVisit === "function") visit = onVisit;
  let current: string;
  try {
    current = normalize(dirname(filePath));
  } catch {
    return [];
  }
  const dirs: string[] = [];
  const seen = new Set<string>();
  while (true) {
    if (!seen.has(current)) {
      seen.add(current);
      dirs.push(current);
      visit?.(current);
    }
    const parent = normalize(dirname(current));
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}
