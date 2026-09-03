import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function loadRtkConfig(): { enabled: boolean; binary_path?: string } | null {
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
        const rtk = parsed.data.rtk as Record<string, unknown> | undefined
        if (rtk && typeof rtk.enabled === "boolean") return { enabled: rtk.enabled as boolean, binary_path: rtk.binary_path as string | undefined }
      } catch {}
    }
  }
  return null
}

export const rtkCheck: DoctorCheck = {
  name: "rtk-integration",
  category: "integrations",
  check: (): CheckResult => {
    const cfg = loadRtkConfig()
    if (!cfg?.enabled) {
      return {
        name: "rtk-integration",
        status: "pass",
        message: "RTK disabled — skipping",
        detail: "Set rtk.enabled:true in matrixx.jsonc to enable",
      }
    }
    const bin = cfg.binary_path ?? "rtk"
    let version: string | null = null
    try {
      const r = Bun.spawnSync([bin, "--version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) version = r.stdout.toString().trim().split("\n")[0] ?? null
    } catch {}
    if (!version) {
      const which = Bun.which(bin)
      if (!which) {
        return {
          name: "rtk-integration",
          status: "warn",
          message: "RTK enabled but binary not found",
          detail: `Binary "${bin}" not in PATH — install via brew install rtk-ai/tap/rtk or curl install`,
        }
      }
      version = which
    }
    return {
      name: "rtk-integration",
      status: "pass",
      message: `RTK enabled, binary found${version ? `: ${version}` : ""}`,
    }
  },
}
