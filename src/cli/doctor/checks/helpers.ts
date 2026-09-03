import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { detectConfigFile, parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"

export function readMatrixxConfig(): Record<string, unknown> | null {
  const userDir = getOpenCodeConfigDir({ binary: "opencode" })
  const bases = [join(process.cwd(), ".opencode", "matrixx"), join(process.cwd(), "matrixx"), join(userDir, "matrixx")]
  for (const base of bases) {
    const detected = detectConfigFile(base)
    if (detected.format !== "none" && existsSync(detected.path)) {
      try {
        const raw = readFileSync(detected.path, "utf-8")
        const parsed = parseJsoncSafe<Record<string, unknown>>(raw)
        if (parsed.data && parsed.errors.length === 0) return parsed.data
      } catch { void 0 }
    }
  }
  return null
}

export function getNested<T>(obj: Record<string, unknown> | null, path: string): T | undefined {
  if (!obj) return undefined
  const parts = path.split(".")
  let cur: unknown = obj
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur as T | undefined
}
