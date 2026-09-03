import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function loadHeadroomConfig(): { enabled: boolean; proxyUrl?: string } | null {
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
        const hr = parsed.data.headroom as Record<string, unknown> | undefined
        if (hr && typeof hr.enabled === "boolean") return { enabled: hr.enabled as boolean, proxyUrl: hr.proxyUrl as string | undefined }
      } catch {}
    }
  }
  return null
}

export const headroomCheck: DoctorCheck = {
  name: "headroom-integration",
  category: "integrations",
  check: (): CheckResult => {
    const cfg = loadHeadroomConfig()
    if (!cfg?.enabled) {
      return {
        name: "headroom-integration",
        status: "pass",
        message: "Headroom disabled — skipping",
        detail: "Set headroom.enabled:true in matrixx.jsonc to enable",
      }
    }
    let version: string | null = null
    try {
      const r = Bun.spawnSync(["headroom", "--version"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) version = r.stdout.toString().trim().split("\n")[0] ?? null
    } catch {}
    if (!version) {
      const which = Bun.which("headroom")
      if (!which) {
        return {
          name: "headroom-integration",
          status: "warn",
          message: "Headroom enabled but headroom binary not found",
          detail: `Install via uv tool install headroom-ai[all] or pipx install headroom-ai[all]\nProxy expected at ${cfg.proxyUrl ?? "http://127.0.0.1:8787"}`,
        }
      }
      version = which
    }
    if (cfg.proxyUrl) {
      try {
        const probe = Bun.spawnSync(["curl", "-fsS", "--max-time", "2", cfg.proxyUrl], { stdout: "pipe", stderr: "pipe" })
        if (probe.exitCode !== 0) {
          return {
            name: "headroom-integration",
            status: "warn",
            message: `Headroom ${version} found but proxy not reachable at ${cfg.proxyUrl}`,
            detail: "Start proxy: headroom wrap opencode",
          }
        }
      } catch {}
    }
    return {
      name: "headroom-integration",
      status: "pass",
      message: `Headroom enabled, binary found${version ? `: ${version}` : ""}`,
    }
  },
}
