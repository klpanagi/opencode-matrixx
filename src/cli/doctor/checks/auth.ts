import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { readConnectedProvidersCache, readProviderModelsCache } from "../../../shared/connected-providers-cache"
import { parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

type ProviderStatus = { provider: string; configured: boolean; detail?: string }
type DiscoveredProvider = { id: string; source: string; detail: string }
const ENV_PREFIX_MAP: Record<string, string> = { ANTHROPIC: "anthropic", OPENAI: "openai", GEMINI: "google", GOOGLE: "google", GITHUB: "github-copilot", ZAI: "zai-coding-plan", COPILOT: "github-copilot", VERTEX: "google" }
function mapEnvPrefix(rawPrefix: string): string {
  const upper = rawPrefix.toUpperCase()
  if (ENV_PREFIX_MAP[upper]) return ENV_PREFIX_MAP[upper]
  const first = upper.split("_")[0] ?? ""
  if (ENV_PREFIX_MAP[first]) return ENV_PREFIX_MAP[first]
  return `custom:${rawPrefix.toLowerCase().replace(/_/g, "-")}`
}
function getOpenCodeConfigText(): DiscoveredProvider[] {
  const results: DiscoveredProvider[] = []
  const configDir = getOpenCodeConfigDir({ binary: "opencode" })
  for (const p of [join(configDir, "opencode.json"), join(configDir, "opencode.jsonc")]) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, "utf-8")
      const parsed = parseJsoncSafe<Record<string, unknown>>(raw)
      if (!parsed.data || parsed.errors.length > 0) continue
      const rec = (parsed.data as { provider?: Record<string, unknown> }).provider
      if (!rec || typeof rec !== "object") continue
      for (const k of Object.keys(rec)) if (k.trim()) results.push({ id: k.trim(), source: "opencode config", detail: `provider key in ${p}` })
    } catch { void 0 }
  }
  return results
}
function getAuthTextStructured(): DiscoveredProvider[] {
  const results: DiscoveredProvider[] = []
  for (const p of [join(homedir(), ".local", "share", "opencode", "auth.json"), join(homedir(), ".config", "opencode", "auth.json")]) {
    if (!existsSync(p)) continue
    try {
      const raw = readFileSync(p, "utf-8")
      const parsed = parseJsoncSafe<Record<string, unknown>>(raw)
      if (!parsed.data || parsed.errors.length > 0) continue
      for (const k of Object.keys(parsed.data)) if (k.trim()) results.push({ id: k.trim(), source: "auth storage", detail: `key in ${p}` })
    } catch { void 0 }
  }
  return results
}
function collectSpawnProviders(): DiscoveredProvider[] {
  const results: DiscoveredProvider[] = []
  try {
    const proc = Bun.spawnSync(["opencode", "auth", "list", "--json"], { stdout: "pipe", stderr: "pipe", timeout: 5000 })
    if (proc.exitCode !== 0) return results
    const stdout = proc.stdout.toString().trim()
    if (!stdout) return results
    try {
      const parsed = JSON.parse(stdout) as unknown
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim()) results.push({ id: item.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
          else if (item && typeof item === "object" && "id" in item && typeof (item as { id: unknown }).id === "string" && (item as { id: string }).id.trim()) results.push({ id: (item as { id: string }).id.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
        }
        if (results.length > 0) return results
      }
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>
        if (Array.isArray(obj.providers)) {
          for (const p of obj.providers as unknown[]) {
            if (typeof p === "string" && p.trim()) results.push({ id: p.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
            else if (p && typeof p === "object" && "id" in p && typeof (p as { id: unknown }).id === "string" && (p as { id: string }).id.trim()) results.push({ id: (p as { id: string }).id.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
            else if (p && typeof p === "object" && "provider" in p && typeof (p as { provider: unknown }).provider === "string" && (p as { provider: string }).provider.trim()) results.push({ id: (p as { provider: string }).provider.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
          }
          if (results.length > 0) return results
        }
        if (Array.isArray(obj.connected)) {
          for (const c of obj.connected as unknown[]) if (typeof c === "string" && c.trim()) results.push({ id: c.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
          if (results.length > 0) return results
        }
        const keys = Object.keys(obj).filter((k) => k !== "providers" && k !== "connected")
        if (keys.length > 0 && obj.providers === undefined && obj.connected === undefined) {
          for (const k of keys) if (k.trim()) results.push({ id: k.trim(), source: "opencode auth list", detail: "from opencode auth list --json" })
          if (results.length > 0) return results
        }
      }
    } catch { void 0 }
    const lower = stdout.toLowerCase()
    let found = false
    for (const m of lower.matchAll(/"id"\s*:\s*"([^"]+)"/g)) {
      const v = m[1]?.trim()
      if (v) { results.push({ id: v, source: "opencode auth list", detail: "from opencode auth list --json (raw)" }); found = true }
    }
    if (found) return results
  } catch { void 0 }
  return results
}
function collectEnvProviders(): DiscoveredProvider[] {
  const results: DiscoveredProvider[] = []
  const pattern = /^[A-Z0-9_]+_(API_KEY|TOKEN)$/
  for (const [key, value] of Object.entries(process.env)) {
    if (!value || !pattern.test(key)) continue
    const rawPrefix = key.replace(/_(API_KEY|TOKEN)$/, "")
    if (!rawPrefix) continue
    results.push({ id: mapEnvPrefix(rawPrefix), source: "env", detail: `${key} env var set` })
  }
  return results
}
function discoverProviders(): DiscoveredProvider[] {
  const seen = new Map<string, DiscoveredProvider>()
  const add = (idRaw: string, source: string, detail: string) => {
    const n = idRaw.trim().toLowerCase()
    if (!n || seen.has(n)) return
    seen.set(n, { id: idRaw.trim(), source, detail })
  }
  try { const ids = readConnectedProvidersCache(); if (ids) for (const id of ids) add(id, "connected-providers cache", "from connected-providers.json") } catch { void 0 }
  try { const c = readProviderModelsCache(); if (c) { for (const id of c.connected) add(id, "provider-models cache", "from provider-models.json connected") } } catch { void 0 }
  try { for (const e of getOpenCodeConfigText()) add(e.id, e.source, e.detail) } catch { void 0 }
  try { for (const e of getAuthTextStructured()) add(e.id, e.source, e.detail) } catch { void 0 }
  try { for (const e of collectSpawnProviders()) add(e.id, e.source, e.detail) } catch { void 0 }
  try { for (const e of collectEnvProviders()) add(e.id, e.source, e.detail) } catch { void 0 }
  return [...seen.values()]
}
export const authCheck: DoctorCheck = {
  name: "authentication",
  category: "authentication",
  check: (): CheckResult => {
    const discovered = discoverProviders()
    const cache = readConnectedProvidersCache()
    const statuses: ProviderStatus[] = discovered.map((d) => ({ provider: d.id, configured: true, detail: `${d.detail} (${d.source})` }))
    if (discovered.length === 0) {
      const sources = ["connected-providers cache (~/.cache/matrixx/connected-providers.json)", "provider-models cache (~/.cache/matrixx/provider-models.json)", "opencode config provider keys (opencode.json{c} via getOpenCodeConfigDir)", "auth storage keys (~/.local/share/opencode/auth.json, ~/.config/opencode/auth.json)", "opencode auth list --json", "env scan *_API_KEY/*_TOKEN"]
      return { name: "authentication", status: "fail", message: "No API providers configured — run `opencode auth login` or set *_API_KEY", detail: `Attempted sources:\n${sources.map((s) => `  - ${s}`).join("\n")}` }
    }
    if (cache === null && discovered.some((d) => d.source !== "connected-providers cache" && d.source !== "provider-models cache")) {
      return { name: "authentication", status: "warn", message: "Providers found in config/auth/env but connected-providers cache empty — restart OpenCode to refresh", detail: statuses.map((p) => `  ${p.provider}: ${p.detail ?? "configured"}`).join("\n") }
    }
    const sorted = [...discovered].sort((a, b) => a.id.localeCompare(b.id))
    const maxShow = 20
    const displayIds = sorted.slice(0, maxShow).map((d) => d.id)
    const more = sorted.length > maxShow ? ` (+${sorted.length - maxShow} more)` : ""
    const list = displayIds.join(", ") + more
    const detailLines = statuses.slice(0, maxShow).map((p) => `  ${p.provider}: ${p.detail ?? "configured"}`)
    if (statuses.length > maxShow) detailLines.push(`  ... and ${statuses.length - maxShow} more`)
    return { name: "authentication", status: "pass", message: `Configured providers (${discovered.length}): ${list}`, detail: detailLines.join("\n") }
  },
}
