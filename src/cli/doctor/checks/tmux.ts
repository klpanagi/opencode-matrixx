import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function loadTmuxEnabled(): boolean | null {
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
        const tmux = parsed.data.tmux as Record<string, unknown> | undefined
        if (tmux && typeof tmux.enabled === "boolean") return tmux.enabled as boolean
      } catch {}
    }
  }
  return null
}

export const tmuxCheck: DoctorCheck = {
  name: "tmux-integration",
  category: "integrations",
  check: (): CheckResult => {
    const enabled = loadTmuxEnabled()
    if (!enabled) {
      return {
        name: "tmux-integration",
        status: "pass",
        message: "tmux disabled — skipping",
        detail: "Set tmux.enabled:true in matrixx.jsonc to enable",
      }
    }
    let version: string | null = null
    try {
      const r = Bun.spawnSync(["tmux", "-V"], { stdout: "pipe", stderr: "pipe" })
      if (r.exitCode === 0) version = r.stdout.toString().trim()
    } catch {}
    if (!version) {
      const which = Bun.which("tmux")
      if (!which) {
        return {
          name: "tmux-integration",
          status: "warn",
          message: "tmux enabled but tmux binary not found",
          detail: "Install tmux: apt install tmux / brew install tmux",
        }
      }
      version = which
    }
    const inside = !!process.env.TMUX
    return {
      name: "tmux-integration",
      status: "pass",
      message: `tmux enabled, binary found${version ? `: ${version}` : ""} ${inside ? "(inside tmux)" : "(not inside tmux)"}`,
    }
  },
}
