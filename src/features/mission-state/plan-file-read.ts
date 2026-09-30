import { existsSync, readFileSync } from "node:fs"
import { MAX_PLAN_FILE_BYTES, measurePlanBytes } from "./constants"

/**
 * Plan file readers.
 *
 * Split out of `plan-storage.ts` for the 200-LOC ceiling. The two readers are
 * deliberately separate functions rather than one with a `skipCap` flag: the cap
 * in `readPlanFile` is the defensive whole-file guard, and a boolean on the
 * signature would put "turn it off" one edit away from a whole-file call site.
 */

/**
 * Read a plan file's content.
 * Returns null if the file does not exist, is too large, or cannot be read.
 */
export function readPlanFile(planPath: string, cap: number = MAX_PLAN_FILE_BYTES): string | null {
  try {
    if (!existsSync(planPath)) return null
    const content = readFileSync(planPath, "utf-8")
    if (measurePlanBytes(content) > cap) return null
    return content
  } catch {
    return null
  }
}

/** Read a plan file for a SPAN read, skipping the cap. See the module header. */
export function readPlanFileSpan(planPath: string): string | null {
  try {
    if (!existsSync(planPath)) return null
    return readFileSync(planPath, "utf-8")
  } catch {
    return null
  }
}
