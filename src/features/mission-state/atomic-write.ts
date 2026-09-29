import { renameSync, writeFileSync } from "node:fs"

/**
 * The tmp+rename primitive every plan write goes through.
 *
 * Split out of `plan-storage.ts` to keep that module under the 200-LOC ceiling.
 * The target is never written in place — it is only ever REPLACED by rename — so
 * a crash mid-write leaves the previous bytes intact rather than a truncated file.
 */
export function atomicWrite(filePath: string, content: string): boolean {
  try {
    const tmpPath = `${filePath}.tmp.${process.pid}`
    writeFileSync(tmpPath, content, "utf-8")
    renameSync(tmpPath, filePath)
    return true
  } catch {
    return false
  }
}
