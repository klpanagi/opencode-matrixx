import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function loadDcpEnabled(): boolean | null {
  const userDir = getOpenCodeConfigDir({ binary: "opencode" })
  const bases = [join(userDir, "matrixx"), join(process.cwd(), ".opencode", "matrixx"), join(process.cwd(), "matrixx")]
  for (const base of bases) {
    for (const ext of [".jsonc", ".json"]) {
      const p = `${base}${ext}`
      if (!existsSync(p)) continue
      try {
        const c = readFileSync(p, "utf-8")
        const parsed = parseJsoncSafe<Record<string, unknown>>(c)
        if (!parsed.data || parsed.errors.length > 0) continue
        const dcp = parsed.data.dcp as Record<string, unknown> | undefined
        if (dcp && typeof dcp.enabled === "boolean") return dcp.enabled as boolean
      } catch {}
    }
  }
  return null
}

export const dcpCheck: DoctorCheck = {
  name: "dcp-integration",
  category: "integrations",
  check: (): CheckResult => {
    const enabled = loadDcpEnabled()
    if (enabled === false) {
      return {
        name: "dcp-integration",
        status: "pass",
        message: "DCP disabled — skipping",
      }
    }
    const dir = getOpenCodeConfigDir({ binary: "opencode" })
    const pluginDir = join(dir, "node_modules", "@tarquinen", "opencode-dcp")
    const dcpJsonc = join(dir, "dcp.jsonc")
    const hasPlugin = existsSync(pluginDir)
    const hasJsonc = existsSync(dcpJsonc)
    if (!hasPlugin) {
      return {
        name: "dcp-integration",
        status: "warn",
        message: "DCP plugin not found",
        detail: `Expected at ${pluginDir}\nInstall: npm install @tarquinen/opencode-dcp in ${dir}`,
      }
    }
    if (hasJsonc) {
      try {
        const c = readFileSync(dcpJsonc, "utf-8")
        const parsed = parseJsoncSafe(c)
        if (parsed.errors.length > 0) {
          return {
            name: "dcp-integration",
            status: "warn",
            message: "DCP plugin installed but dcp.jsonc invalid",
            detail: parsed.errors.map((e) => `${e.message} at offset ${e.offset}`).join(", "),
          }
        }
      } catch {}
    }
    return {
      name: "dcp-integration",
      status: "pass",
      message: `DCP plugin installed at ${pluginDir}${hasJsonc ? " (dcp.jsonc present)" : ""}`,
    }
  },
}
