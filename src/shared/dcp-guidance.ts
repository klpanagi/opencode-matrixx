import { join } from "node:path"
import { readJsoncFile } from "./jsonc-parser"
import { getOpenCodeConfigDir } from "./opencode-config-dir"

interface DcpGuidanceConfig {
  enabled?: boolean
  compress?: { permission?: string }
  manualMode?: { enabled?: boolean }
}

/**
 * How DCP compression is available. "guided" = DCP auto-mode (nudges drive
 * DCP's `compress` tool); "manual" = DCP manualMode (tool exists,
 * trigger-only, no nudges); "none" = no `compress` tool exists.
 */
export type DcpCompressionMode = "guided" | "manual" | "none"

let _dcpConfigPathOverride: string | null | undefined
let _memo: DcpCompressionMode | undefined

export function _setDcpConfigPathForTesting(p: string | null | undefined): void {
  _dcpConfigPathOverride = p
  _memo = undefined
}

export function _resetDcpGuidanceForTesting(): void {
  _dcpConfigPathOverride = undefined
  _memo = undefined
}

function resolveDcpConfigPath(): string | null {
  if (_dcpConfigPathOverride !== undefined) return _dcpConfigPathOverride
  try {
    return join(getOpenCodeConfigDir({ binary: "opencode" }), "dcp.jsonc")
  } catch {
    return null
  }
}

/**
 * How DCP compression is available in this environment.
 * True model (DCP owns the only `compress` tool — the host has none):
 * - "guided": DCP auto-mode — call `compress` only with trigger/nudge context; never bare.
 * - "manual": DCP manualMode — call `compress` only after the manual trigger; no nudges.
 * - "none": no `compress` tool exists — never call it.
 */
export function resolveDcpCompressionMode(): DcpCompressionMode {
  if (_memo !== undefined) return _memo
  const path = resolveDcpConfigPath()
  if (!path) {
    _memo = "none"
    return _memo
  }
  const config = readJsoncFile<DcpGuidanceConfig>(path)
  if (!config || config.enabled === false || config.compress?.permission === "deny") {
    _memo = "none"
  } else if (config.manualMode?.enabled === true) {
    _memo = "manual"
  } else {
    _memo = "guided"
  }
  return _memo
}
