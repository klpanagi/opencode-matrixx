export interface DiffResult {
  added: string[];
  removed: string[];
  changed: string[];
}

/**
 * Perform a shallow diff between two objects, returning the keys that were
 * added, removed, or whose values changed.
 * Only the top-level keys are compared — nested objects are compared by
 * reference (JSON.stringify equality for value comparison).
 */
export function diffObjects<T extends Record<string, unknown>>(
  oldObj: T,
  currentObj: T,
): DiffResult {
  const oldKeys = new Set(Object.keys(oldObj));
  const currentKeys = new Set(Object.keys(currentObj));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const key of currentKeys) {
    if (!oldKeys.has(key)) {
      added.push(key);
    }
  }

  for (const key of oldKeys) {
    if (!currentKeys.has(key)) {
      removed.push(key);
    }
  }

  for (const key of oldKeys) {
    if (currentKeys.has(key)) {
      const oldVal = oldObj[key];
      const currentVal = currentObj[key];
      if (!isEqual(oldVal, currentVal)) {
        changed.push(key);
      }
    }
  }

  return { added, removed, changed };
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  return false;
}

export function hasChanges(diff: DiffResult): boolean {
  return (
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
  );
}
